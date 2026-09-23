import { PolicyChat } from "./policy-chat";
import { listAccreditationAskChats } from "./actions";

export default async function AskPolicyPage() {
  const { chats, error } = await listAccreditationAskChats();
  return <><h1 className="sr-only">Ask Policy chat</h1><PolicyChat initialChats={chats} initialError={error} /></>;
}
