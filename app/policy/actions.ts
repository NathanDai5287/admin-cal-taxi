"use server";

import { z } from "zod";
import { getAccreditationProviders } from "@/lib/accreditation/providers";
import { createAccreditationAdminClient } from "@/lib/accreditation/supabase";
import { informationalAnswer, insufficientAnswer, type PolicyAnswer, type PolicyChunk } from "@/lib/policy/answers";
import { generatePolicyAnswer, resolveQuestionDate } from "@/lib/policy/answers";
import { policyClient, questionLimit, requirePolicyMember } from "@/lib/policy/server";
import { buildPolicyToolContext, clockQuestionIntent, describeClock, getPolicyClock } from "@/lib/policy/tools";

export type QuestionResult = { answer?: PolicyAnswer; chunks?: PolicyChunk[]; error?: string; date?: string };
const inputSchema = z.object({ question: z.string().trim().min(5).max(4000), date: z.iso.date() });
export async function askPolicy(_previous: QuestionResult, form: FormData): Promise<QuestionResult> {
  const session = await requirePolicyMember();
  const clock = getPolicyClock();
  const input = inputSchema.safeParse({ question: form.get("question"), date: form.get("date") || clock.local_date });
  if (!input.success) return { error: "Enter a question (5–4,000 characters) and a valid date." };
  const db = createAccreditationAdminClient();
  const reservation = await db.rpc("reserve_policy_question", { p_member: session.userId, p_question: input.data.question, p_date: input.data.date, p_minute: questionLimit("POLICY_QUESTIONS_PER_MINUTE", 5), p_day: questionLimit("POLICY_QUESTIONS_PER_DAY", 50) });
  if (reservation.error) return { error: /Question limit/.test(reservation.error.message) ? "Question limit reached. Please retry after the minute or 24-hour window resets." : "Questions are temporarily unavailable. Please try again later." };
  let modelConfig: Record<string, unknown> = {};
  let retrievedReferences: PolicyChunk[] = [];
  try {
    const clockIntent = clockQuestionIntent(input.data.question);
    if (clockIntent) {
      const answer = informationalAnswer(describeClock(clockIntent, clock));
      modelConfig = { provider: "server", model: "policy-tools-v1", tools: ["current_date_time"], timeZone: clock.time_zone };
      const saved = await db.from("policy_questions").update({ answer, model_config: modelConfig, question_date: clock.local_date }).eq("id", reservation.data);
      if (saved.error) throw new Error("Answer could not be saved.");
      return { answer, chunks: [], date: clock.local_date };
    }
    const providers = getAccreditationProviders();
    if (!providers.language || !providers.embeddings) throw new Error("AI is unavailable. Please retry later.");
    modelConfig = { provider: providers.language.name, model: providers.language.model, fallbackModel: providers.language.fallbackModel ?? null, embeddingModel: providers.embeddings.model, embeddingProfile: providers.embeddings.profile, dimensions: 768, tools: ["current_date_time", "calendar_math", "published_policy_search"], timeZone: clock.time_zone };
    const resolved = await resolveQuestionDate(providers.language, input.data.question, form.get("date") ? input.data.date : null, input.data.date, clock.time_zone);
    input.data.date = resolved.date;
    const dateSaved = await db.from("policy_questions").update({ question_date: resolved.date }).eq("id", reservation.data);
    if (dateSaved.error) throw new Error("Question date could not be saved.");
    if (resolved.ambiguous) {
      const answer = insufficientAnswer("The event date is ambiguous. Enter its exact date in the date field and submit again.");
      const saved = await db.from("policy_questions").update({ answer, model_config: modelConfig }).eq("id", reservation.data);
      if (saved.error) throw new Error("Answer could not be saved.");
      return { answer, chunks: [], date: resolved.date };
    }
    const vector = await providers.embeddings.embedQuery(input.data.question);
    const client = await policyClient();
    const retrieval = await client.rpc("search_policy_chunks", { p_query: input.data.question, p_embedding: JSON.stringify(vector), p_profile: providers.embeddings.profile, p_date: input.data.date });
    if (retrieval.error) throw new Error("Policy retrieval is unavailable. Please retry later.");
    const chunks: PolicyChunk[] = (retrieval.data ?? []).map((c: Omit<PolicyChunk, "ref">) => ({ ...c, ref: `POL:${c.source_id}:${c.ordinal}` }));
    retrievedReferences = chunks.map((c) => ({ ...c, content: "" }));
    const trustedRuntime = buildPolicyToolContext(input.data.date, clock);
    const answer = await generatePolicyAnswer(providers.language, input.data.question, input.data.date, chunks, trustedRuntime);
    const saved = await db.from("policy_questions").update({ answer, retrieved_chunks: retrievedReferences, model_config: modelConfig }).eq("id", reservation.data);
    if (saved.error) throw new Error("The answer could not be saved for audit. Please retry later.");
    return { answer, chunks: retrievedReferences, date: input.data.date };
  } catch (error) {
    const message = /capacity|quota|rate.limit|RESOURCE_EXHAUSTED/i.test(String(error)) ? "Gemini's capacity or free-tier quota is temporarily unavailable. Please retry later." : "The assistant could not produce a verified answer. Please retry later or contact an officer.";
    await db.from("policy_questions").update({ error: message, model_config: modelConfig, retrieved_chunks: retrievedReferences }).eq("id", reservation.data);
    return { error: message };
  }
}
