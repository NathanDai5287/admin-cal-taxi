import Link from "next/link";
import { redirect } from "next/navigation";
import { db, getConnectPerson } from "@/lib/alumni-connect/server";
export const dynamic = "force-dynamic";
export default async function ConnectNews() {
  const person = await getConnectPerson();
  if (!person) redirect("/connect");
  if (!person.canReadNews)
    return <p>Your current chapter permissions don’t include Nu News.</p>;
  const { data: issues, error } = await db()
    .from("nu_news_issues")
    .select("id,season,issue_date")
    .not("finalized_at", "is", null)
    .not("final_pdf_path", "is", null)
    .order("issue_date", { ascending: false });
  if (error) throw new Error("Nu News is unavailable");
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="page-title">Nu News</h1>
        <p className="page-lede">The Nu Chapter newsletter.</p>
      </header>
      {issues?.length ? (
        <ul className="list-none p-0 m-0 divide-y divide-rule">
          {issues.map((issue) => (
            <li className="py-5" key={issue.id}>
              <Link
                className="flex justify-between gap-3 text-brand font-semibold"
                href={`/connect/news/${issue.id}/pdf?view=1`}
              >
                <span>{issue.season}</span>
                <span>Read PDF</span>
              </Link>
              <a
                className="text-sm text-brand underline inline-block mt-2"
                href={`/connect/news/${issue.id}/pdf`}
              >
                Download PDF
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No completed issues yet.</p>
      )}
      <Link className="text-brand underline" href="/connect">
        Back to Connect
      </Link>
    </div>
  );
}
