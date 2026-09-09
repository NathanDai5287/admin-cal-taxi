import {
  getRushLeads,
  getRushVotes,
  getPairSummaries,
  getScanStats,
} from "@/lib/rush-data";
import { banPairAction, unbanPairAction } from "./actions";
import ResetVotesButton from "./ResetVotesButton";
import { SiteHomeIcon } from "@/components/site-home-icon";
import { Button } from "@/components/brand/button";

export const dynamic = "force-dynamic";

export default async function RushAdminPage() {
  const [leads, votes, pairs, scans] = await Promise.all([
    getRushLeads(),
    getRushVotes(),
    getPairSummaries(),
    getScanStats(),
  ]);
  const peakDay = scans.daily.reduce(
    (max, d) => (d.total > max ? d.total : max),
    0,
  );
  const autoCount = leads.filter((l) => l.source === "auto").length;
  const manualCount = leads.length - autoCount;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <SiteHomeIcon />

      <h1 className="mt-2 text-2xl font-bold text-ink">Rush Week</h1>
      <p className="mt-1 text-sm text-muted">
        {leads.length} RSVP{leads.length === 1 ? "" : "s"} — {autoCount} from
        the popup, {manualCount} from the RSVP button
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">QR code scans</h2>
        <p className="mt-1 text-xs text-muted">
          Printed codes point at rush.cal.taxi/r/&lt;source&gt;, which records the
          scan and redirects to the homepage. Unique counts one phone once per
          source. Link-preview bots and crawlers are excluded from these totals.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-rule bg-surface px-4 py-3">
            <div className="text-2xl font-bold text-ink">
              {scans.totalScans}
            </div>
            <div className="text-xs text-muted">Total scans</div>
          </div>
          <div className="rounded-lg border border-rule bg-surface px-4 py-3">
            <div className="text-2xl font-bold text-ink">
              {scans.totalUnique}
            </div>
            <div className="text-xs text-muted">Unique phones</div>
          </div>
          <div className="rounded-lg border border-rule bg-surface px-4 py-3">
            <div className="text-2xl font-bold text-muted">
              {scans.botHits}
            </div>
            <div className="text-xs text-muted">Bots filtered out</div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-rule bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-muted">
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Scans</th>
                <th className="px-4 py-2 font-medium">Unique</th>
                <th className="px-4 py-2 font-medium">Today</th>
              </tr>
            </thead>
            <tbody>
              {scans.sources.map((s) => (
                <tr
                  key={s.source}
                  className="border-b border-rule last:border-0"
                >
                  <td className="px-4 py-2 font-medium text-ink">
                    {s.label}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">
                    /r/{s.source}
                  </td>
                  <td className="px-4 py-2 text-ink">{s.total}</td>
                  <td className="px-4 py-2 text-ink">{s.unique}</td>
                  <td className="px-4 py-2 text-muted">{s.today}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {scans.daily.length > 0 && (
          <div className="mt-3 rounded-lg border border-rule bg-surface p-4">
            <h3 className="text-xs font-medium text-muted">Scans per day</h3>
            <div className="mt-3 space-y-1">
              {scans.daily.map((d) => (
                <div key={d.date} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 font-mono text-muted">
                    {d.date}
                  </span>
                  <span
                    className="h-3 rounded-sm bg-brand"
                    style={{
                      width: `${peakDay > 0 ? (d.total / peakDay) * 100 : 0}%`,
                      minWidth: d.total > 0 ? "2px" : "0",
                    }}
                  />
                  <span className="text-ink">{d.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {scans.recent.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-ink">
              Recent scans ({scans.recent.length})
            </summary>
            <div className="mt-2 overflow-x-auto rounded-lg border border-rule bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-rule text-muted">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">New?</th>
                    <th className="px-4 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.recent.map((s, i) => (
                    <tr
                      key={`${s.ts}-${i}`}
                      className="border-b border-rule last:border-0"
                    >
                      <td className="px-4 py-2 text-muted">
                        {new Date(s.ts).toLocaleString("en-US", {
                          timeZone: "America/Los_Angeles",
                        })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted">
                        {s.source}
                      </td>
                      <td className="px-4 py-2 text-muted">
                        {s.unique ? "first scan" : "repeat"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted">
                        {s.ip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">RSVP leads</h2>
        {leads.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No submissions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-rule bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Submitted</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => (
                  <tr key={i} className="border-b border-rule last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">
                      {lead.name}
                    </td>
                    <td className="px-4 py-2 text-ink">{lead.phone}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          lead.source === "manual"
                            ? "bg-caution-light text-caution"
                            : "bg-brand-light text-brand"
                        }`}
                      >
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {new Date(lead.ts).toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })}
                    </td>
                    <td className="px-4 py-2 text-muted">{lead.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            Pizza topping votes
          </h2>
          <ResetVotesButton />
        </div>
        {votes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No votes yet.</p>
        ) : (
          <div className="mt-3 max-w-sm overflow-x-auto rounded-lg border border-rule bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-muted">
                  <th className="px-4 py-2 font-medium">Topping</th>
                  <th className="px-4 py-2 font-medium">Votes</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => (
                  <tr key={v.name} className="border-b border-rule last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">
                      {v.name}
                    </td>
                    <td className="px-4 py-2 text-ink">{v.votes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">
          IP + device pairs — votes, leads, and bans
        </h2>
        <p className="mt-1 text-xs text-muted">
          Bans always target the exact (IP, device) pair — never the IP or
          device alone — so a ban can&apos;t block an entire shared WiFi or
          follow someone onto a different network.
        </p>
        {pairs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-rule bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-muted">
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
                    className="border-b border-rule last:border-0"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-ink">
                      {entry.ip || "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">
                      {entry.deviceId || "—"}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {entry.names.length > 0 ? entry.names.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-2 text-ink">
                      {entry.voteCount}
                    </td>
                    <td className="px-4 py-2 text-ink">
                      {entry.leadCount}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          entry.banned
                            ? "bg-warn-light text-warn"
                            : "bg-ok-light text-ok"
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
                        <Button
                          type="submit"
                          variant={entry.banned ? "secondary" : "danger"}
                          compact
                        >
                          {entry.banned ? "Unban" : "Ban"}
                        </Button>
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
