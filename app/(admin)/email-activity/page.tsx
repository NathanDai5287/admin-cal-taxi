import { redirect } from "next/navigation";

export default async function EmailActivityRedirect({ searchParams }: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const query = order ? `?${new URLSearchParams({ order })}` : "";
  redirect(`/host/email-activity${query}`);
}
