import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAllPlatformRules } from "@/lib/data";
import { getPlatform } from "@/lib/platform";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/types";

export const metadata = { title: "Platform guide · Puŕ Fermé Creative Studio" };

export default async function GuidePage() {
  const [platform, rules] = await Promise.all([getPlatform(), getAllPlatformRules()]);
  const by = Object.fromEntries(rules.map((r) => [r.platform, r]));
  const rowLabels = by.meta?.comparison.map((c) => c.row) ?? [];
  const valueFor = (p: string, row: string) => by[p]?.comparison.find((c) => c.row === row)?.value ?? "";
  const current = by[platform];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Platform guide</h1>
        <p className="prose-serif mt-1 text-ink-soft">The three platforms work differently. Switch platforms at the top to change the highlighted column and the guide below.</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">How Meta, Amazon and Flipkart differ</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-48 p-4">
                <span className="sr-only">Topic</span>
              </th>
              {PLATFORMS.map((p) => (
                <th
                  key={p}
                  scope="col"
                  aria-current={p === platform ? "true" : undefined}
                  className={`p-4 text-base font-bold ${p === platform ? "bg-accent text-accent-ink" : "text-ink-soft"}`}
                >
                  {PLATFORM_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((row) => (
              <tr key={row} className="border-b border-line align-top last:border-0">
                <th scope="row" className="p-4 font-semibold">
                  {row}
                </th>
                {PLATFORMS.map((p) => (
                  <td key={p} className={`p-4 ${p === platform ? "bg-accent-soft font-semibold text-ink" : "text-ink-soft"}`}>
                    {valueFor(p, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current ? (
        <article className="guide-md card mx-auto max-w-3xl">
          <p className="text-sm font-bold tracking-wide text-accent uppercase">{PLATFORM_LABELS[platform]} guide</p>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.guideMarkdown}</ReactMarkdown>
        </article>
      ) : null}
    </div>
  );
}
