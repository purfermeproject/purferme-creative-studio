import { desc, gte, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { estimateCostUsd } from "@/lib/pricing";

export const metadata = { title: "Usage · Puŕ Fermé Creative Studio" };

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);

type Agg = { calls: number; input: number; output: number; cost: number };

function UsageTable({ title, data, first }: { title: string; data: Map<string, Agg>; first: string }) {
  return (
    <section className="card overflow-x-auto p-0" aria-label={title}>
      <h2 className="p-4 pb-2 text-lg font-bold">{title}</h2>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-ink-soft">
          <tr>
            <th className="px-4 py-2">{first}</th>
            <th className="px-4 py-2 text-right">Calls</th>
            <th className="px-4 py-2 text-right">Input tokens</th>
            <th className="px-4 py-2 text-right">Output tokens</th>
            <th className="px-4 py-2 text-right">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {[...data.entries()].map(([k, a]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="px-4 py-2 font-semibold">{k}</td>
              <td className="px-4 py-2 text-right tabular-nums">{a.calls}</td>
              <td className="px-4 py-2 text-right tabular-nums">{a.input.toLocaleString("en-IN")}</td>
              <td className="px-4 py-2 text-right tabular-nums">{a.output.toLocaleString("en-IN")}</td>
              <td className="px-4 py-2 text-right tabular-nums">{usd(a.cost)}</td>
            </tr>
          ))}
          {data.size === 0 ? (
            <tr>
              <td colSpan={5} className="hint px-4 py-3">
                No model calls in this period.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Math.min(365, Math.max(1, Number((await searchParams).days) || 30));
  const since = daysAgo(days);
  const l = schema.generationLogs;
  const rows = await db
    .select({
      day: sql<string>`to_char(${l.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
      user: l.user,
      model: l.model,
      kind: l.kind,
      calls: sql<number>`count(*)::int`,
      input: sql<number>`coalesce(sum(${l.inputTokens}), 0)::int`,
      output: sql<number>`coalesce(sum(${l.outputTokens}), 0)::int`,
    })
    .from(l)
    .where(gte(l.createdAt, since))
    .groupBy(sql`1`, l.user, l.model, l.kind)
    .orderBy(desc(sql`1`));

  const add = (map: Map<string, Agg>, key: string, r: (typeof rows)[number]) => {
    const a = map.get(key) ?? { calls: 0, input: 0, output: 0, cost: 0 };
    a.calls += r.calls;
    a.input += r.input;
    a.output += r.output;
    a.cost += estimateCostUsd(r.model, r.input, r.output);
    map.set(key, a);
  };
  const byDay = new Map<string, Agg>();
  const byUser = new Map<string, Agg>();
  const byKind = new Map<string, Agg>();
  for (const r of rows) {
    add(byDay, r.day, r);
    add(byUser, r.user, r);
    add(byKind, r.kind, r);
  }
  const total = [...byDay.values()].reduce((s, a) => ({ calls: s.calls + a.calls, input: s.input + a.input, output: s.output + a.output, cost: s.cost + a.cost }), { calls: 0, input: 0, output: 0, cost: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm">
            <Link href="/admin" className="font-semibold text-accent hover:underline">
              ← Settings
            </Link>
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight">Usage and cost</h1>
          <p className="hint mt-1">Text costs are estimated at Anthropic list prices (USD). Image costs show as $0 here; check your OpenAI usage page for those.</p>
        </div>
        <nav aria-label="Period" className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/admin/usage?days=${d}`} aria-current={d === days ? "page" : undefined} className={d === days ? "chip border-accent bg-accent-soft text-accent" : "chip"}>
              Last {d} days
            </Link>
          ))}
        </nav>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Calls", total.calls.toLocaleString("en-IN")],
          ["Input tokens", total.input.toLocaleString("en-IN")],
          ["Output tokens", total.output.toLocaleString("en-IN")],
          ["Estimated cost", usd(total.cost)],
        ].map(([k, v]) => (
          <div key={k} className="card">
            <p className="hint">{k}</p>
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <UsageTable title="Per day (IST)" data={byDay} first="Day" />
      <UsageTable title="Per user" data={byUser} first="User" />
      <UsageTable title="Per kind of call" data={byKind} first="Kind" />
    </div>
  );
}
