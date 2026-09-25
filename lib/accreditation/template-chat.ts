import "server-only";

import { getAccreditationProviders } from "./providers";
import { draftTemplateWithProvider, type TemplateChatInput } from "./template-drafting";

export { TEMPLATE_CHAT_MAX_HISTORY, TEMPLATE_CHAT_MAX_MESSAGE } from "./template-drafting";
export type { TemplateChatMessage, TemplateChatResult } from "./template-drafting";

export async function resolveTemplateChat(input: TemplateChatInput) {
  const provider = getAccreditationProviders().language;
  if (!provider) throw new Error("The accreditation assistant is not configured.");
  return draftTemplateWithProvider(provider, input);
}
