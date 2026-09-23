"use server";

import {
  deleteAccreditationAskChat as deleteChat,
  listAccreditationAskChats as listChats,
  loadAccreditationAskChat as loadChat,
  runAccreditationChat,
} from "@/lib/accreditation/chat-service";

export type {
  AccreditationAskChatSummary,
  AccreditationAskChatTurn,
  AccreditationChatResult,
  AccreditationChatSource,
} from "@/lib/accreditation/chat-service";

export async function listAccreditationAskChats() {
  return listChats();
}

export async function loadAccreditationAskChat(chatId: string) {
  return loadChat(chatId);
}

export async function deleteAccreditationAskChat(chatId: string) {
  return deleteChat(chatId);
}

export async function askAccreditationChat(formData: FormData) {
  return runAccreditationChat(formData);
}
