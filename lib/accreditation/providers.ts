import "server-only";

import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { GeminiLanguageModelProvider, GeminiEmbeddingProvider, GeminiOcrProvider, validateEmbedding, matchesSchema, aiError } from "./gemini";

import type { ExtractedChunk } from "./types";

export type StructuredGenerationRequest = {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
};

export interface LanguageModelProvider {
  readonly name: string;
  readonly model: string;
  generateStructured(request: StructuredGenerationRequest): Promise<unknown>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  readonly profile: string;
  embedDocuments(inputs: string[], title?: string): Promise<number[][]>;
  embedQuery(input: string): Promise<number[]>;
}

export interface OcrProvider {
  readonly name: string;
  readonly model: string;
  extract(bytes: Uint8Array, filename: string, mimeType: string): Promise<ExtractedChunk[]>;
}

class OpenAILanguageModelProvider implements LanguageModelProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateStructured(request: StructuredGenerationRequest) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.responses.create({
        model: this.model,
        store: false,
        instructions: request.instructions,
        input: request.input,
        text: {
          format: {
            type: "json_schema",
            name: request.name,
            strict: true,
            schema: request.schema,
          },
        },
      }).catch(aiError);
      try {
        const value: unknown = JSON.parse(response.output_text ?? "");
        if (!matchesSchema(value, request.schema)) throw new Error("Invalid structure.");
        return value;
      } catch { if (attempt === 1) throw new Error("The model returned malformed output twice. Please retry."); }
    }
    throw new Error("No structured response.");
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 768;
  get profile() { return `${this.model}:768:openai-v1`; }
  readonly name = "openai";
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embedDocuments(inputs: string[]) {
    if (!inputs.length) return [];
    const response = await this.client.embeddings.create({ model: this.model, input: inputs, dimensions: 768 });
    return response.data.sort((a, b) => a.index - b.index).map((item) => validateEmbedding(item.embedding));
  }
  async embedQuery(input: string) { return (await this.embedDocuments([input]))[0]; }
}

export type AccreditationProviders = {
  language: LanguageModelProvider | null;
  embeddings: EmbeddingProvider | null;
  ocr: OcrProvider | null;
};

export function getAccreditationProviders(): AccreditationProviders {
  const provider = (process.env.ACCREDITATION_AI_PROVIDER ?? "gemini").toLowerCase();
  if (process.env.ACCREDITATION_EMBEDDING_DIMENSIONS && process.env.ACCREDITATION_EMBEDDING_DIMENSIONS !== "768") throw new Error("Embedding dimensions must be 768.");
  const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
  const ocr = gemini ? new GeminiOcrProvider(gemini, process.env.ACCREDITATION_OCR_MODEL ?? "gemini-3.8-flash") : null;
  if (provider === "openai" && process.env.OPENAI_API_KEY) return {
    language: new OpenAILanguageModelProvider(process.env.OPENAI_API_KEY, process.env.ACCREDITATION_LLM_MODEL ?? "gpt-5-mini"),
    embeddings: new OpenAIEmbeddingProvider(process.env.OPENAI_API_KEY, process.env.ACCREDITATION_EMBEDDING_MODEL ?? "text-embedding-3-small"),
    ocr,
  };
  if (provider !== "gemini" || !gemini) return { language: null, embeddings: null, ocr: null };
  const model = process.env.ACCREDITATION_EMBEDDING_MODEL ?? "gemini-embedding-2";
  return {
    language: new GeminiLanguageModelProvider(gemini, process.env.ACCREDITATION_LLM_MODEL ?? "gemini-3.8-flash"),
    embeddings: new GeminiEmbeddingProvider(gemini, model, process.env.ACCREDITATION_EMBEDDING_PROFILE ?? `${model}:768:retrieval-v1`),
    ocr,
  };
}
