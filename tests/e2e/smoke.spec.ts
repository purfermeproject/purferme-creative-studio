import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Dev sign-in (local only)").fill("e2e@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/create");
}

async function choosePlatform(page: Page, name: "Meta" | "Amazon" | "Flipkart") {
  await page.getByRole("radio", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
}

test.describe.configure({ mode: "serial" });

test("unauthenticated visitors are sent to login, and unknown emails are refused", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Dev sign-in (local only)").fill("stranger@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("isn't on the team list")).toBeVisible();
});

test("Meta: generate 3 UGC concepts with streamed progress and save one", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Chocolate Cookies, millet & oats, 240g" });
  await page.getByLabel("Creative type").selectOption("9:16 UGC-style video (15–30s)");
  await page.getByRole("button", { name: "Generate 3 concepts" }).click();
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByTestId("concept-2")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("concept-3")).toHaveCount(0);
  const first = page.getByTestId("concept-0");
  await expect(first.getByText("Why it fits Meta")).toBeVisible();
  await first.getByRole("button", { name: "Save to library" }).click();
  await expect(first.getByRole("link", { name: /Saved/ })).toBeVisible();
});

test("Amazon: creative types change and video scripts have on-screen text in every frame", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Amazon");
  const types = await page.getByLabel("Creative type").locator("option").allTextContents();
  expect(types).toContain("Sponsored Brands video (16:9, muted)");
  expect(types).not.toContain("9:16 UGC-style video (15–30s)");
  await page.getByLabel("Creative type").selectOption("Sponsored Brands video (16:9, muted)");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText("Why it fits Amazon")).toBeVisible();
  const onscreen = await card.locator("tbody tr td:nth-child(3)").allTextContents();
  expect(onscreen.length).toBeGreaterThanOrEqual(4);
  for (const t of onscreen) expect(t.trim()).not.toBe("");
  await choosePlatform(page, "Meta");
});

test("Sunrise Bowl cannot be generated and shows why", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Sunrise Bowl porridge mixes (blocked)" });
  await expect(page.getByTestId("product-blocked")).toContainText("IMS Act");
  await expect(page.getByRole("button", { name: /Generate/ })).toBeDisabled();
});

test("a concept with 'gluten free' is flagged red and cannot be approved", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByLabel(/Extra direction/).fill("Gluten free cookies for your chai");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card.getByTestId("scan-hits")).toContainText("Gluten free", { timeout: 60_000 });
  await card.getByRole("button", { name: "Save to library" }).click();
  await card.getByRole("link", { name: /Saved/ }).click();
  const item = page.locator("details[open][data-testid^=creative-]");
  for (const box of await item.getByRole("checkbox").all()) await box.check();
  await item.getByLabel("Status").selectOption("Approved");
  await expect(item.getByRole("alert")).toContainText("Can't move to Approved yet");
  await expect(item.getByRole("alert")).toContainText("Gluten free");
  await page.reload();
  await expect(page.locator("details[open][data-testid^=creative-]").getByTestId("status-chip")).toHaveText("Draft");
});

test("Admin: moving a product from hold to ready makes it generatable immediately", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Pur'GreenX, adults, mixed berries (hold)" });
  await expect(page.getByRole("button", { name: /Generate/ })).toBeDisabled();

  await page.goto("/admin");
  const card = page.getByTestId("product-greenx");
  await card.locator("summary").click();
  await card.getByLabel(/Status for/).selectOption("ready");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.goto("/create");
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Pur'GreenX, adults, mixed berries" });
  await expect(page.getByRole("button", { name: /Generate/ })).toBeEnabled();
});

test("Library CSV export downloads a valid CSV", async ({ page }) => {
  await signIn(page);
  const res = await page.request.get("/api/library/export?platform=all");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const text = await res.text();
  const lines = text.trim().split("\r\n");
  expect(lines[0].startsWith("id,platform,product,creative_type,status,title")).toBe(true);
  expect(lines.length).toBeGreaterThan(1);
});

test("Claim checker highlights terms instantly and runs a deep check", async ({ page }) => {
  await signIn(page);
  await page.goto("/check");
  await page.getByLabel("Copy to check").fill("Guilt-free treat, packed with protein");
  await expect(page.getByTestId("highlighted").locator("mark")).toHaveCount(2);
  await page.getByRole("button", { name: "Run deep check" }).click();
  await expect(page.getByTestId("deep-result")).toContainText("Suggested rewrite");
});
