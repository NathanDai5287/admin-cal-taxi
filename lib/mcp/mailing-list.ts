import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { broadcastSchema, parseRecipients, renderBroadcast } from "@/lib/mailing-list/broadcast";
import { broadcastSender, getBroadcast, listBroadcasts, listGroups, prepareBroadcast, publishNewsletter, refreshBroadcast, saveBroadcast, saveGroup, sendBroadcast } from "@/lib/mailing-list/store";
import { loadBroadcastAnalytics } from "@/lib/mailing-list/analytics";

export function registerMailingTools(server: McpServer, authorize: (tool: string, targetId?: string) => Promise<void>) {
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const write = { ...read, readOnlyHint: false };
  const external = { ...write, openWorldHint: true };
  const result = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
  const id = z.uuid();
  server.registerTool("list_mailing_lists", { description: "List saved mailing lists and recipient counts. Active administrator OAuth access required.", inputSchema: z.object({}), annotations: read }, async () => {
    await authorize("list_mailing_lists");
    return result((await listGroups()).map(({ id, name, recipients, updated_at }) => ({ id, name, recipientCount: recipients.length, updated_at })));
  });
  server.registerTool("get_mailing_list", { description: "Read a saved mailing list, including its recipients and revision.", inputSchema: z.object({ listId: id }), annotations: read }, async ({ listId }) => {
    await authorize("get_mailing_list", listId);
    const group = (await listGroups()).find((g) => g.id === listId);
    if (!group) throw new Error("Mailing list not found.");
    return result(group);
  });
  server.registerTool("save_mailing_list", { description: "Create or replace a named list from pasted addresses separated by newlines, commas, or semicolons. Invalid entries are refused; duplicates removed. Reuse listId for creation retries; include expectedUpdatedAt to edit. Does not send email.",
    inputSchema: z.object({ listId: id, name: z.string().trim().min(1).max(100), text: z.string().max(2_000_000), expectedUpdatedAt: z.string().optional() }), annotations: write }, async ({ listId, name, text, expectedUpdatedAt }) => {
    await authorize("save_mailing_list", listId);
    const parsed = parseRecipients(text);
    if (parsed.invalid.length) throw new Error(`Invalid entries: ${parsed.invalid.slice(0, 5).join(", ")}`);
    const saved = await saveGroup({ name, recipients: parsed.recipients }, listId, expectedUpdatedAt);
    return result({ listId: saved.id, name: saved.name, updated_at: saved.updated_at, recipientCount: parsed.recipients.length, duplicatesRemoved: parsed.duplicates });
  });
  server.registerTool("list_broadcasts", { description: "List saved broadcast drafts and sending states. Use get_broadcast to review the full message.", inputSchema: z.object({}), annotations: read }, async () => {
    await authorize("list_broadcasts");
    return result((await listBroadcasts()).map(({ id, name, subject, status, recipient_count, updated_at }) => ({ id, name, subject, status, recipient_count, updated_at })));
  });
  server.registerTool("get_broadcast", { description: "Read the complete saved broadcast, formatted HTML preview, configured sender, and expectedUpdatedAt revision for preparing or sending. Preserve user-supplied subject and body exactly.", inputSchema: z.object({ broadcastId: id }), annotations: read }, async ({ broadcastId }) => {
    await authorize("get_broadcast", broadcastId);
    const row = await getBroadcast(broadcastId);
    return result({ ...row, html: renderBroadcast(row), configuredSender: broadcastSender(), expectedUpdatedAt: row.updated_at });
  });
  server.registerTool("save_broadcast", { description: "Save a broadcast draft with its list, subject, exact body, reply-to email, and chapter mailing address. list_id may be null until a list is chosen. Reuse broadcastId for creation retries; expectedUpdatedAt is required for edits. Does not send. Prepared messages cannot be edited.",
    inputSchema: z.object({ broadcastId: id, draft: broadcastSchema, expectedUpdatedAt: z.string().optional() }), annotations: write }, async ({ broadcastId, draft, expectedUpdatedAt }) => {
    await authorize("save_broadcast", broadcastId);
    return result(await saveBroadcast(draft, broadcastId, expectedUpdatedAt));
  });
  server.registerTool("prepare_broadcast", { description: "Freeze a saved draft and import its recipients into a dedicated Resend segment. Requires a verified sender, chosen list, subject, body, reply-to, and mailing address. Does not send. Call again while preparing until ready; review get_broadcast and ask the user to approve before send_broadcast.",
    inputSchema: z.object({ broadcastId: id, expectedUpdatedAt: z.string() }), annotations: external }, async ({ broadcastId, expectedUpdatedAt }) => {
    await authorize("prepare_broadcast", broadcastId);
    if ((await getBroadcast(broadcastId)).newsletter_id) await authorize("publish_nu_news_link", broadcastId);
    return result(await prepareBroadcast(broadcastId, expectedUpdatedAt));
  });
  server.registerTool("send_broadcast", { description: "Send a prepared broadcast to its frozen list. First show the user the exact subject, body, sender, and recipient count from get_broadcast. Only set confirm=true after explicit approval of that message and recipients. Never retry an uncertain send or send a replacement without checking Resend.",
    inputSchema: z.object({ broadcastId: id, expectedUpdatedAt: z.string(), confirm: z.literal(true) }), annotations: { ...external, destructiveHint: true } }, async ({ broadcastId, expectedUpdatedAt, confirm }) => {
    await authorize("send_broadcast", broadcastId);
    return result(await sendBroadcast(broadcastId, expectedUpdatedAt, confirm));
  });
  server.registerTool("refresh_broadcast_status", { description: "Reconcile a saved broadcast with Resend after an uncertain send. Never sends or resends mail.", inputSchema: z.object({ broadcastId: id }), annotations: write }, async ({ broadcastId }) => {
    await authorize("refresh_broadcast_status", broadcastId);
    return result(await refreshBroadcast(broadcastId));
  });
  server.registerTool("get_broadcast_analytics", { description: "Read unique and total email opens/clicks, recipient activity, and public newsletter page visits, PDF link opens, and downloads. Email opens are approximate; public reader counts identify browsers, not people. PDF download clicks do not prove that someone read the file.", inputSchema: z.object({ broadcastId: id }), annotations: { ...read, openWorldHint: true } }, async ({ broadcastId }) => {
    await authorize("get_broadcast_analytics", broadcastId);
    return result(await loadBroadcastAnalytics(broadcastId));
  });
  server.registerTool("publish_nu_news_link", { description: "Publish a finalized Nu News issue on cal.taxi and return its permanent public reading link. Anyone can read or download that issue without signing in. Draft issues are refused. Requires explicit user approval to publish; does not send email.", inputSchema: z.object({ issueId: id, confirm: z.literal(true) }), annotations: { ...external, destructiveHint: true } }, async ({ issueId }) => {
    await authorize("publish_nu_news_link", issueId);
    return result(await publishNewsletter(issueId));
  });
}
