import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/create", "/guide", "/check", "/library", "/results", "/admin", "/admin/usage"];

test("main pages have no serious or critical accessibility violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).analyze();
  const problems: string[] = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `/login: ${v.id} (${v.nodes.length})`);

  await page.getByLabel("Dev sign-in (local only)").fill("e2e@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/create");

  for (const path of PAGES) {
    await page.goto(path);
    const r = await new AxeBuilder({ page }).analyze();
    for (const v of r.violations) {
      if (["serious", "critical"].includes(v.impact ?? "")) problems.push(`${path}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")})`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
