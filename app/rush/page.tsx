import Link from "next/link";
import { getRushLeads, getRushVotes, getPairSummaries } from "@/lib/rush-data";
import { banPairAction, unbanPairAction } from "./actions";
import ResetVotesButton from "./ResetVotesButton";

export const dynamic = "force-dynamic";

export default async function RushAdminPage() {
  const [leads, votes, pairs] = await Promise.all([
    getRushLeads(),
    getRushVotes(),
    getPairSummaries(),
  ]);
  const autoCount = leads.filter((l) => l.source === "auto").length;
  const manualCount = leads.length - autoCount;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← Admin home
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">Rush Week</h1>
      <p className="mt-1 text-sm text-slate-500">
        {leads.length} RSVP{leads.length === 1 ? "" : "s"} — {autoCount} from
        the popup, {manualCount} from the RSVP button
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-800">RSVP leads</h2>
        {leads.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No submissions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Submitted</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {lead.name}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{lead.phone}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          lead.source === "manual"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(lead.ts).toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{lead.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            Pizza topping votes
          </h2>
          <ResetVotesButton />
        </div>
        {votes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No votes yet.</p>
        ) : (
          <div className="mt-3 max-w-sm overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-4 py-2 font-medium">Topping</th>
                  <th className="px-4 py-2 font-medium">Votes</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => (
                  <tr key={v.name} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {v.name}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{v.votes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-800">
          IP + device pairs — votes, leads, and bans
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Bans always target the exact (IP, device) pair — never the IP or
          device alone — so a ban can&apos;t block an entire shared WiFi or
          follow someone onto a different network.
        </p>
        {pairs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No activity yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 font-medium">Device</th>
                  <th className="px-4 py-2 font-medium">Names</th>
                  <th className="px-4 py-2 font-medium">Votes</th>
                  <th className="px-4 py-2 font-medium">Leads</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((entry) => (
                  <tr
                    key={`${entry.ip}|${entry.deviceId}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">
                      {entry.ip || "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {entry.deviceId || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {entry.names.length > 0 ? entry.names.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {entry.voteCount}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {entry.leadCount}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          entry.banned
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {entry.banned ? "banned" : "active"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <form
                        action={entry.banned ? unbanPairAction : banPairAction}
                      >
                        <input type="hidden" name="ip" value={entry.ip} />
                        <input
                          type="hidden"
                          name="deviceId"
                          value={entry.deviceId}
                        />
                        <button
                          type="submit"
                          className={`rounded px-3 py-1 text-xs font-semibold ${
                            entry.banned
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              : "bg-red-600 text-white hover:bg-red-700"
                          }`}
                        >
                          {entry.banned ? "Unban" : "Ban"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
