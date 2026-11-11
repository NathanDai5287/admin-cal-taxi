import { validToken } from "@/lib/alumni-connect/server";
import { UnsubscribeForm } from "../../public-forms";
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <h1 className="page-title">Manage your subscription</h1>
      {validToken(token) ? (
        <UnsubscribeForm credential={token} />
      ) : (
        <p>
          This link is unavailable. Sign in to Connect to manage your
          subscription.
        </p>
      )}
    </>
  );
}
