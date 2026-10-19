import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Dev sign-in (local only)").fill("e2e@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
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
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByText("isn't on the team list")).toBeVisible();
});

test("Meta: generate 3 UGC concepts with streamed progress and save one", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Chocolate Cookies, millet & oats, 240g" });
  await page.getByLabel("Type of ad", { exact: true }).selectOption("9:16 UGC-style video (15–30s)");
  await page.getByRole("button", { name: "Generate 3 ad ideas" }).click();
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByTestId("concept-2")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("concept-3")).toHaveCount(0);
  const first = page.getByTestId("concept-0");
  await expect(first.getByText("Why it fits Meta")).toBeVisible();
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("link", { name: /Saved/ })).toBeVisible();
});

test("Amazon: creative types change and video scripts have on-screen text in every frame", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Amazon");
  const types = await page.getByLabel("Type of ad", { exact: true }).locator("option").allTextContents();
  expect(types).toContain("Sponsored Brands video (16:9, muted)");
  expect(types).not.toContain("9:16 UGC-style video (15–30s)");
  await page.getByLabel("Type of ad", { exact: true }).selectOption("Sponsored Brands video (16:9, muted)");
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
  await page.getByText("More options").click();
  await page.getByLabel(/Anything else/).fill("Gluten free cookies for your chai");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card.getByTestId("scan-hits")).toContainText("Gluten free", { timeout: 60_000 });
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByRole("link", { name: /Saved/ }).click();
  const item = page.locator("details[open][data-testid^=creative-]");
  // Simple path: the banned words are listed and Approve stays disabled even after ticking the list.
  await expect(item.getByTestId("gate-missing")).toContainText("gluten free");
  await item.getByLabel(/pre-launch list/).check();
  await expect(item.getByRole("button", { name: "Approve" })).toBeDisabled();
  // The server enforces it too, if someone forces the status.
  await item.getByLabel("Change status").selectOption("Approved");
  await expect(item.getByRole("alert")).toContainText("Can't move to Approved yet");
  await expect(item.getByRole("alert")).toContainText("Gluten free");
  await page.reload();
  await expect(page.locator("details[open][data-testid^=creative-]").getByTestId("status-chip")).toHaveText("Draft");
});

test("a clean idea can be approved with one tick and one click", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card.getByTestId("scan-clean")).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByRole("link", { name: /Saved/ }).click();
  const item = page.locator("details[open][data-testid^=creative-]");
  await expect(item.getByRole("button", { name: "Approve" })).toBeDisabled();
  await item.getByLabel(/pre-launch list/).check();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item.getByTestId("status-chip")).toHaveText("Approved");
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

test("Make image creates a picture that stays with the saved ad", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Make image" }).click();
  const img = card.getByTestId("image-maker").locator("img");
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  // Meta video ideas default to the exact Reels size.
  await expect(card.getByTestId("image-dims").first()).toContainText("1080×1920");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByRole("link", { name: /Saved/ }).click();
  const item = page.locator("details[open][data-testid^=creative-]");
  await expect(item.getByTestId("image-maker").locator("img")).toHaveCount(1);
  await item.getByLabel("Image size").selectOption({ label: "Feed 4:5 · 1080×1350" });
  await item.getByRole("button", { name: "Make another image" }).click();
  await expect(item.getByTestId("image-maker").locator("img")).toHaveCount(2);
  await expect(item.getByTestId("image-dims").nth(1)).toContainText("1080×1350");
  await page.reload();
  await expect(page.locator("details[open][data-testid^=creative-]").getByTestId("image-maker").locator("img")).toHaveCount(2);
});

test("team password: wrong password is refused, right one signs in with your name", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Team password").fill("nope");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await expect(page.getByText("That password isn't right")).toBeVisible();

  await page.getByLabel(/Your name/).fill("Priya");
  await page.getByLabel("Team password").fill("e2e-team-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.waitForURL("**/create");
  await page.goto("/admin/usage");
  await expect(page.getByRole("heading", { name: "Usage and cost" })).toBeVisible();
});

test("Write your own: custom ad type, angle and language are accepted", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByLabel("Type of ad", { exact: true }).selectOption({ label: "✏️ Write your own…" });
  await page.getByLabel("Type of ad: write your own").fill("6s bumper video for Reels");
  await page.getByText("More options").click();
  await page.getByLabel("Angle (what the ad is about)", { exact: true }).selectOption({ label: "✏️ Write your own…" });
  await page.getByLabel(/Angle .*write your own/).fill("Monsoon chai-time snack");
  await page.getByLabel("Language", { exact: true }).selectOption({ label: "✏️ Write your own…" });
  await page.getByLabel("Language: write your own").fill("Punjabi");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText("Monsoon chai-time snack");
});

test("Brand kit + Add text & logo saves a full-size image with crisp text", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin#brand-kit");
  const kit = page.getByTestId("brand-kit");
  await kit.getByLabel("Primary (buttons, CTA) hex").fill("#aa3300");
  await kit.getByRole("button", { name: "Save brand kit" }).click();
  await expect(kit.getByText("Brand kit saved.")).toBeVisible();

  await page.goto("/create");
  await choosePlatform(page, "Meta");
  await page.getByLabel("Type of ad", { exact: true }).selectOption("Static image ad (4:5)");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Make image" }).click();
  await expect(card.getByTestId("image-dims").first()).toContainText("1080×1350");
  await card.getByRole("button", { name: "Add text & logo" }).first().click();
  const editor = page.getByTestId("overlay-editor");
  await expect(editor.getByTestId("overlay-canvas")).toBeVisible();
  await editor.getByLabel("Headline").fill("3pm called. It wants chai.");
  await editor.getByRole("button", { name: "Save as new image" }).click();
  await expect(editor).toHaveCount(0);
  await expect(card.getByTestId("image-maker").locator("img")).toHaveCount(2);
  await expect(card.getByTestId("image-dims").nth(1)).toContainText("1080×1350");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByRole("link", { name: /Saved/ }).click();
  const item = page.locator("details[open][data-testid^=creative-]");
  await expect(item.getByTestId("image-maker").locator("img")).toHaveCount(2);
  await expect(item.getByText("with text")).toBeVisible();
});

test("Preview shows the image in platform mock-ups with safe zones", async ({ page }) => {
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.getByRole("button", { name: /Generate/ }).click();
  const card = page.getByTestId("concept-0");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Make image" }).click();
  await card.getByRole("button", { name: "Preview" }).first().click();
  const pv = page.getByTestId("placement-preview");
  await expect(pv.getByText("Covered by UI · keep text out")).toBeVisible();
  await pv.getByRole("button", { name: "Feed post" }).click();
  await expect(pv.getByText("Sponsored")).toBeVisible();
  await pv.getByLabel("Safe zones").uncheck();
  await pv.getByRole("button", { name: "Close" }).click();
  await expect(pv).toHaveCount(0);
});

test("Check a finished design: reads the text, flags claims and size", async ({ page }) => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 720, height: 1280, channels: 3, background: "#c8862a" } }).png().toBuffer();
  await signIn(page);
  await choosePlatform(page, "Meta");
  await page.goto("/check");
  await page.getByLabel("Upload a design").setInputFiles({ name: "design.png", mimeType: "image/png", buffer: png });
  const result = page.getByTestId("design-result");
  await expect(result).toContainText("720×1280", { timeout: 30_000 });
  await expect(result).toContainText("Right shape (9:16)");
  await expect(result).toContainText("Too small");
  await expect(result).toContainText("red flag");
  await expect(page.getByLabel("Copy to check")).toHaveValue(/Gluten free crunch/);
  await expect(page.getByTestId("highlighted").locator("mark").first()).toBeVisible();
});
