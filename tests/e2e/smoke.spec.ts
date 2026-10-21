import { expect, test, type Locator, type Page } from "@playwright/test";

async function signIn(page: Page, email = "e2e@example.com") {
  await page.goto("/login");
  await page.getByLabel("Dev sign-in (local only)").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL("**/create");
}

type BriefOpts = {
  product?: string;
  platform?: "Instagram & Facebook" | "Amazon" | "Flipkart";
  type?: string;
  placement?: string;
  deliverable?: "Ad concept" | "UGC script" | "Ad copy set";
  objective?: string;
  extra?: string;
  /** Make the first image automatically after developing (off by default in tests, so image counts stay exact). */
  autoImage?: boolean;
};

async function fillBrief(page: Page, o: BriefOpts) {
  // Wait until the brief has restored this browser's last choices, so they can't overwrite ours.
  await page.locator("form[aria-label=Brief][data-ready]").waitFor();
  if (o.product) await page.getByRole("radiogroup", { name: "Product" }).getByText(o.product, { exact: true }).click();
  if (o.objective) await page.getByRole("radiogroup", { name: "Campaign objective" }).getByText(o.objective, { exact: true }).click();
  if (o.platform) await page.getByRole("radiogroup", { name: "Platform" }).getByText(o.platform, { exact: true }).click();
  if (o.type) await page.getByLabel("Type of ad", { exact: true }).selectOption(o.type);
  if (o.placement) await page.getByLabel("Where it runs", { exact: true }).selectOption(o.placement);
  if (o.deliverable) await page.getByRole("radiogroup", { name: "What to make" }).getByText(o.deliverable, { exact: true }).click();
  await page.getByLabel("Make the first image automatically").setChecked(Boolean(o.autoImage));
  if (o.extra) {
    await page.getByText("More direction").click();
    await page.getByLabel(/Anything else/).fill(o.extra);
  }
}

/** Brief → 3 proposals → develop the first. Returns the workspace creative. */
async function develop(page: Page, o: BriefOpts = {}) {
  await page.goto("/create");
  await fillBrief(page, o);
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  await expect(page.getByTestId("proposal-2")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("proposal-3")).toHaveCount(0);
  await page.getByTestId("proposal-0").getByRole("button", { name: /^Develop as/ }).click();
  const ws = page.getByTestId("workspace-creative");
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/create\?creative=/);
  return ws;
}

/** Make an image without the automatic hook text, so image counts stay exact (the auto text has its own test). */
async function makeImage(ws: Locator, text: "overlay" | "auto" = "overlay") {
  await ws.getByLabel("Text on image").first().selectOption(text);
  await ws.getByRole("button", { name: "Make image" }).click();
}

const inspector = (page: Page) => page.getByRole("complementary", { name: "Check and edit" });

async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test("unauthenticated visitors are sent to login, and unknown emails are refused", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Dev sign-in (local only)").fill("stranger@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByText("isn't on the team list")).toBeVisible();
});

test("workflow: brief → 3 proposals → develop → saved draft with version 1, clearly marked as mock", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await page.goto("/create");
  await fillBrief(page, { objective: "Awareness", type: "9:16 UGC-style video (15–30s)" });
  await page.getByTestId("shopper-mindset").locator("summary").click();
  await expect(page.getByTestId("shopper-mindset")).toContainText("Scrolling, not shopping");
  await expect(page.getByTestId("shopper-mindset")).toContainText("Unaware or problem-aware");
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByTestId("proposal-2")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("proposal-0").getByTestId("mock-badge")).toBeVisible();
  await expect(page.getByTestId("proposal-1").getByTestId("lever")).toHaveText("Lever: Transparency and trust");
  await page.getByTestId("proposal-1").getByRole("button", { name: "Develop as ad concept" }).click();
  const ws = page.getByTestId("workspace-creative");
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await expect(ws.getByTestId("creative-title")).toHaveText("Flip the pack");
  await expect(ws).toContainText("Awareness");
  await expect(ws.getByTestId("mock-badge")).toBeVisible();
  await expect(ws.getByTestId("scene-list").locator("li")).toHaveCount(4);
  await expect(ws.getByTestId("creative-preview")).toBeVisible();
  await expect(inspector(page).getByTestId("checks-clear")).toBeVisible();

  // It's already saved: reload keeps it, and it's in the library and history.
  await page.reload();
  await expect(page.getByTestId("creative-title")).toHaveText("Flip the pack");
  await inspector(page).getByRole("tab", { name: "History" }).click();
  await expect(inspector(page).getByTestId("version-row")).toHaveCount(1);
  await expect(inspector(page).getByTestId("version-row").first()).toContainText("Generated");
  await page.goto("/library?platform=all");
  await expect(page.getByText("Flip the pack").first()).toBeVisible();
  await expect(page.getByText("Sample (mock)").first()).toBeVisible();
});

test("autosave: edits save as you type, survive reload, and can be restored from history", async ({ page }) => {
  await signIn(page);
  await develop(page);
  const insp = inspector(page);
  await insp.getByRole("tab", { name: "Edit" }).click();
  await insp.getByLabel("Hook (first 2 seconds)").fill("4:30pm. Laptop on mute. Cookie on duty.");
  await waitSaved(page);
  await expect(page.getByTestId("workspace-creative")).toContainText("4:30pm. Laptop on mute. Cookie on duty.");
  await page.reload();
  await inspector(page).getByRole("tab", { name: "Edit" }).click();
  await expect(inspector(page).getByLabel("Hook (first 2 seconds)")).toHaveValue("4:30pm. Laptop on mute. Cookie on duty.");

  await inspector(page).getByRole("tab", { name: "History" }).click();
  const rows = inspector(page).getByTestId("version-row");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("workspace-creative")).toContainText("3pm called. It wants chai.");
  await expect(inspector(page).getByTestId("version-row")).toHaveCount(3);
  await expect(inspector(page).getByTestId("version-row").first()).toContainText("Restored");
});

test("conflict: an edit from a stale tab is refused instead of overwriting", async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await signIn(a);
  await develop(a);
  const url = a.url();
  const b = await ctx.newPage();
  await b.goto(url);
  await inspector(a).getByRole("tab", { name: "Edit" }).click();
  await inspector(a).getByLabel("Title (internal)").fill("Edited in tab A");
  await waitSaved(a);
  await inspector(b).getByRole("tab", { name: "Edit" }).click();
  await inspector(b).getByLabel("Title (internal)").fill("Edited in tab B");
  await expect(inspector(b).getByTestId("conflict")).toBeVisible({ timeout: 15_000 });
  await inspector(b).getByRole("button", { name: "Load the latest version" }).click();
  await expect(b.getByTestId("creative-title")).toHaveText("Edited in tab A");
  await ctx.close();
});

test("a red claim blocks approval in the workspace and on the server", async ({ page }) => {
  await signIn(page);
  await develop(page, { extra: "Gluten free cookies for your chai" });
  const insp = inspector(page);
  await expect(insp.getByTestId("issues-block")).toContainText("gluten free");
  await insp.getByLabel(/pre-launch list/).check();
  await expect(insp.getByRole("button", { name: "Approve" })).toBeDisabled();
  // The server enforces it too, if someone forces the status.
  await insp.getByLabel("Change status").selectOption("Approved");
  await expect(insp.getByRole("alert")).toContainText("Can't move to Approved yet");
  await expect(insp.getByRole("alert")).toContainText("Gluten free");
  // Fix the wording: the check clears as you type and approval opens up.
  await insp.getByRole("button", { name: "Edit the wording" }).click();
  await insp.getByLabel("Second version or creator brief").fill("Cookies for your chai.");
  await waitSaved(page);
  await insp.getByRole("tab", { name: "Check" }).click();
  await expect(insp.getByTestId("checks-clear")).toBeVisible();
  await insp.getByRole("button", { name: "Approve" }).click();
  await expect(insp.getByTestId("status-chip")).toHaveText("Approved");
});

test("uncertain claims need an approver's sign-off; editing an approved ad sends it back to Draft", async ({ page }) => {
  await signIn(page);
  await develop(page);
  const insp = inspector(page);
  await insp.getByRole("tab", { name: "Edit" }).click();
  await insp.getByLabel("Claim 1", { exact: true }).fill("Kids love it");
  await waitSaved(page);
  await insp.getByRole("tab", { name: "Check" }).click();
  await expect(insp.getByTestId("issues-review")).toContainText("Kids love it");
  await expect(insp.getByTestId("claims-list")).toContainText("Not in library");
  await insp.getByLabel(/pre-launch list/).check();
  await expect(insp.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(insp.getByTestId("gate-missing")).toContainText("approver must confirm");
  await insp.getByRole("button", { name: /checked these claims/ }).click();
  await expect(insp.getByTestId("claims-reviewed")).toContainText("e2e@example.com");
  await insp.getByRole("button", { name: "Approve" }).click();
  await expect(insp.getByTestId("status-chip")).toHaveText("Approved");

  await insp.getByRole("tab", { name: "Edit" }).click();
  await insp.getByLabel("Headline").fill("Read the back first");
  await waitSaved(page);
  await expect(insp.getByTestId("notice")).toContainText("back to Draft");
  await insp.getByRole("tab", { name: "Check" }).click();
  await expect(insp.getByTestId("status-chip")).toHaveText("Draft");
  await expect(insp.getByTestId("claims-reviewed")).toHaveCount(0);
});

test("deliverables: UGC script needs a real person; ad copy set has variants", async ({ page }) => {
  await signIn(page);
  let ws = await develop(page, { deliverable: "UGC script" });
  await expect(ws).toContainText("UGC script");
  await expect(inspector(page).getByTestId("issues-info")).toContainText("Needs a real person");
  ws = await develop(page, { deliverable: "Ad copy set", type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  await expect(ws.getByTestId("copy-variants").locator("li")).toHaveCount(4);
});

test("Amazon: creative types change, no placement choice, and the ad is saved for Amazon", async ({ page }) => {
  await signIn(page);
  await page.goto("/create");
  await fillBrief(page, { platform: "Amazon" });
  const types = await page.getByLabel("Type of ad", { exact: true }).locator("option").allTextContents();
  expect(types).toContain("Sponsored Brands video (16:9, muted)");
  expect(types).not.toContain("9:16 UGC-style video (15–30s)");
  await expect(page.getByLabel("Where it runs", { exact: true })).toHaveCount(0);
  const ws = await develop(page, { platform: "Amazon", type: "Sponsored Brands video (16:9, muted)" });
  await expect(ws).toContainText("Amazon");
  const onscreen = ws.getByTestId("scene-list").locator("li p.font-semibold");
  expect(await onscreen.count()).toBeGreaterThanOrEqual(4);
  await fillBrief(page, { platform: "Instagram & Facebook" });
});

test("Sunrise Bowl cannot be generated and shows why", async ({ page }) => {
  await signIn(page);
  await fillBrief(page, { product: "Sunrise Bowl porridge mixes" });
  await expect(page.getByTestId("product-blocked")).toContainText("IMS Act");
  await expect(page.getByRole("button", { name: "Propose 3 concepts" })).toBeDisabled();
});

test("Admin: moving a product from hold to ready makes it generatable immediately", async ({ page }) => {
  await signIn(page);
  await fillBrief(page, { product: "Pur'GreenX, adults, mixed berries" });
  await expect(page.getByRole("button", { name: "Propose 3 concepts" })).toBeDisabled();

  await page.goto("/admin");
  const card = page.getByTestId("product-greenx");
  await card.locator("summary").click();
  await card.getByLabel(/Status for/).selectOption("ready");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.goto("/create");
  await fillBrief(page, { product: "Pur'GreenX, adults, mixed berries" });
  await expect(page.getByRole("button", { name: "Propose 3 concepts" })).toBeEnabled();
});

test("Admin: product knowledge (priorities, evidence) shows in the brief and the check", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin");
  const card = page.getByTestId("product-choc");
  await card.locator("summary").click();
  await card.getByLabel("Evidence for amber claims").fill("Fibre/protein content (grams per serving only) | 4 g fibre per 30 g serving | Lab report 114");
  await card.getByLabel("Product links").fill("not a link");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(card.getByText("aren't valid web addresses")).toBeVisible();
  await card.getByLabel("Product links").fill("Website | https://purferme.example/choc");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.goto("/create");
  await expect(page.getByTestId("product-knowledge")).toContainText("1 on file");
  await expect(page.getByTestId("product-knowledge")).toContainText("Leads with: Taste first");
  await develop(page);
  const insp = inspector(page);
  await insp.getByRole("tab", { name: "Edit" }).click();
  await insp.getByLabel("Claim 1", { exact: true }).fill("Fibre content (grams per serving only)");
  await waitSaved(page);
  await insp.getByRole("tab", { name: "Check" }).click();
  await expect(insp.getByTestId("issues-review")).toContainText("4 g fibre per 30 g serving");
});

test("Library: search, CSV export and open in workspace", async ({ page }) => {
  await signIn(page);
  await page.goto("/library?platform=all&q=Flip+the+pack");
  await expect(page.getByRole("heading", { name: "Creative library" })).toBeVisible();
  const item = page.locator("[data-testid^=creative-]").first();
  await item.locator("summary").first().click();
  await item.getByRole("link", { name: "Open in workspace" }).click();
  await expect(page.getByTestId("creative-title")).toHaveText("Flip the pack");

  const res = await page.request.get("/api/library/export?platform=all");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const lines = (await res.text()).trim().split("\r\n");
  expect(lines[0].startsWith("id,platform,placement,product,creative_type,status,title")).toBe(true);
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

test("Make image: images attach to the draft at the exact platform size", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page, { type: "9:16 UGC-style video (15–30s)" });
  await makeImage(ws);
  const img = ws.getByTestId("image-gallery").locator("img");
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(ws.getByTestId("image-dims").first()).toContainText("1080×1920");
  await ws.getByLabel("Image size").selectOption({ label: "Feed 4:5 · 1080×1350" });
  await ws.getByRole("button", { name: "Make another image" }).click();
  await expect(img).toHaveCount(2);
  await expect(ws.getByTestId("image-dims").nth(1)).toContainText("1080×1350");
  await page.reload();
  await expect(page.getByTestId("workspace-creative").getByTestId("image-gallery").locator("img")).toHaveCount(2);
  await expect(page.getByTestId("creative-preview").locator("img")).toHaveCount(1);
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
  await page.goto("/create");
  await page.getByLabel("Type of ad", { exact: true }).selectOption({ label: "✏️ Write your own…" });
  await page.getByLabel("Type of ad: write your own").fill("6s bumper video for Reels");
  await page.getByLabel("Angle (what the ad is about)", { exact: true }).selectOption({ label: "✏️ Write your own…" });
  await page.getByLabel(/Angle .*write your own/).fill("Monsoon chai-time snack");
  await page.getByLabel("Language", { exact: true }).selectOption({ label: "✏️ Write your own…" });
  await page.getByLabel("Language: write your own").fill("Punjabi");
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  await expect(page.getByTestId("proposal-0")).toContainText("Monsoon chai-time snack", { timeout: 60_000 });
});

test("Brand kit + Add text & logo saves a full-size image with crisp text", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin#brand-kit");
  const kit = page.getByTestId("brand-kit");
  await kit.getByLabel("Primary (buttons, CTA) hex").fill("#aa3300");
  await kit.getByRole("button", { name: "Save brand kit" }).click();
  await expect(kit.getByText("Brand kit saved.")).toBeVisible();

  const ws = await develop(page, { type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  await makeImage(ws);
  await expect(ws.getByTestId("image-dims").first()).toContainText("1080×1350");
  await ws.getByRole("button", { name: "Add text & logo" }).first().click();
  const editor = page.getByTestId("overlay-editor");
  await expect(editor.getByTestId("overlay-canvas")).toBeVisible();
  await editor.getByLabel("Headline").fill("3pm called. It wants chai.");
  await editor.getByRole("button", { name: "Save as new image" }).click();
  await expect(editor).toHaveCount(0);
  await expect(ws.getByTestId("image-gallery").locator("img")).toHaveCount(2);
  await expect(ws.getByTestId("image-dims").nth(1)).toContainText("1080×1350");
  await page.reload();
  await expect(page.getByTestId("workspace-creative").getByTestId("image-gallery").locator("img")).toHaveCount(2);
  await expect(page.getByTestId("workspace-creative").getByText("with text")).toBeVisible();
});

test("Preview shows the image in platform mock-ups with safe zones", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page);
  await makeImage(ws);
  await ws.getByRole("button", { name: "Preview" }).first().click();
  const pv = page.getByTestId("placement-preview");
  await expect(pv.getByText("Covered by UI · keep text out")).toBeVisible();
  await pv.getByRole("button", { name: "Feed post" }).click();
  await expect(pv.getByText("Sponsored")).toBeVisible();
  await pv.getByLabel("Safe zones").uncheck();
  await pv.getByRole("button", { name: "Close" }).click();
  await expect(pv).toHaveCount(0);
});

test("Product truth: barcode is checked, verified numbers are saved, and the quick-commerce tile previews the image", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin");
  const card = page.getByTestId("product-bar");
  await card.locator("summary").click();
  const truth = card.getByTestId("truth-bar");
  await truth.getByLabel("GTIN / EAN barcode").fill("4006381333932");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(card.getByText("isn't a valid barcode number")).toBeVisible();
  await truth.getByLabel("GTIN / EAN barcode").fill("4006381333931");
  await truth.getByLabel("Net quantity").fill("6 bars × 40 g");
  await card.getByRole("button", { name: "Save" }).first().click();
  await expect(card.getByText("Saved.")).toBeVisible();
  await page.reload();
  await page.getByTestId("product-bar").locator("summary").click();
  await expect(page.getByTestId("truth-bar").getByLabel("Net quantity")).toHaveValue("6 bars × 40 g");

  const ws = await develop(page, { platform: "Amazon" });
  await makeImage(ws);
  await ws.getByRole("button", { name: "Preview" }).first().click();
  const pv = page.getByTestId("placement-preview");
  await pv.getByRole("button", { name: "Quick-commerce tile" }).click();
  await expect(pv.getByTestId("qc-grid")).toContainText("Thumbnail test");
});

test("Check a finished design: reads the text, flags claims and size", async ({ page }) => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 720, height: 1280, channels: 3, background: "#c8862a" } }).png().toBuffer();
  await signIn(page);
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

test("By default a new image gets the hook, CTA and logo added straight away", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page);
  await makeImage(ws, "auto");
  const gallery = ws.getByTestId("image-gallery");
  await expect(gallery.locator("img")).toHaveCount(2, { timeout: 60_000 });
  await expect(ws.getByTestId("image-dims").nth(1)).toContainText("with text");
  await expect(page.getByTestId("creative-preview").locator("img")).toHaveAttribute("src", /.+/);
});

test("Make all sizes: each size the platform needs is made for its own shape", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page, { type: "Static image ad (4:5)" });
  await expect(ws.getByTestId("needed-sizes")).toContainText("Feed 4:5 (1080×1350) · Reels / Stories 9:16 (1080×1920) · Feed / carousel card 1:1 (1080×1080)");
  await ws.getByLabel("Text on image").first().selectOption("overlay");
  await ws.getByRole("button", { name: "Make all 3 sizes Instagram & Facebook needs" }).click();
  await expect(ws.getByTestId("image-gallery").locator("img")).toHaveCount(3, { timeout: 90_000 });
  const dims = ws.getByTestId("image-dims");
  await expect(dims.nth(0)).toContainText("1080×1350");
  await expect(dims.nth(1)).toContainText("1080×1920");
  await expect(dims.nth(2)).toContainText("1080×1080");
});

test("Make all scenes builds a storyboard and the handoff pack ZIP has everything", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page, { type: "9:16 UGC-style video (15–30s)" });
  await ws.getByLabel("Text on image").first().selectOption("overlay");
  await ws.getByRole("button", { name: /Make all \d+ scenes/ }).click();
  const board = ws.getByTestId("storyboard");
  await expect(board.locator("img")).toHaveCount(4, { timeout: 60_000 });
  const zipLink = ws.getByRole("link", { name: "Handoff pack (.zip)" });
  const res = await page.request.get((await zipLink.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await res.body());
  const names = Object.keys(zip.files);
  expect(names.some((n) => n.endsWith("/script.txt"))).toBe(true);
  expect(names.some((n) => n.endsWith("/storyboard.html"))).toBe(true);
  expect(names.filter((n) => /\/images\/scene-0\d-1080x1920-/.test(n)).length).toBe(4);
});

test("Edit with words, All sizes and Compare", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page, { type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  // AI edits are only for scene-only images; images with our real pack can't be redrawn.
  await ws.getByLabel("Pack in the image").selectOption("none");
  await makeImage(ws);
  const gallery = ws.getByTestId("image-gallery");
  await expect(gallery.locator("img")).toHaveCount(1);

  await ws.getByRole("button", { name: "All sizes" }).first().click();
  await expect(gallery.locator("img")).toHaveCount(4, { timeout: 30_000 });
  const dims = ws.getByTestId("image-dims");
  await expect(dims.nth(1)).toContainText("1080×1920");
  await expect(dims.nth(2)).toContainText("1080×1080");
  await expect(dims.nth(3)).toContainText("1200×628");

  await ws.getByRole("button", { name: "Edit with words" }).first().click();
  await ws.getByLabel("Describe the change").fill("make the background lighter");
  await ws.getByRole("button", { name: "Apply change" }).click();
  await expect(gallery.locator("img")).toHaveCount(5, { timeout: 30_000 });
  await expect(dims.nth(4)).toContainText("1080×1350");

  await gallery.getByLabel("Compare").nth(0).check();
  await gallery.getByLabel("Compare").nth(4).check();
  await ws.getByRole("button", { name: "Compare 2 images side by side" }).click();
  await expect(page.getByTestId("compare").locator("img")).toHaveCount(2);
  await page.getByTestId("compare").getByRole("button", { name: "Close" }).click();
});

test("Where it runs: Instagram placement shapes the ad, image size and is saved", async ({ page }) => {
  await signIn(page);
  await page.goto("/create");
  await expect(page.getByLabel("Where it runs", { exact: true })).toHaveValue("Instagram Reels");
  const ws = await develop(page, { type: "Carousel (3–5 cards)", placement: "Instagram Carousel" });
  await expect(ws).toContainText("Instagram Carousel");
  await makeImage(ws);
  await expect(ws.getByTestId("image-dims").first()).toContainText("1080×1080");
  const csv = await (await page.request.get("/api/library/export?platform=meta")).text();
  expect(csv.split("\r\n")[0]).toContain("placement");
  expect(csv).toContain("Instagram Carousel");
});

test("Original pack is placed unchanged, and images with it can't be AI-edited", async ({ page }) => {
  const sharp = (await import("sharp")).default;
  // A cut-out pack: transparent margin around a solid block.
  const pack = await sharp({ create: { width: 300, height: 420, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 240, height: 360, channels: 4, background: { r: 107, g: 63, b: 42, alpha: 1 } } }).png().toBuffer(), left: 30, top: 30 }])
    .png()
    .toBuffer();
  await signIn(page);
  await page.goto("/admin");
  const card = page.getByTestId("product-bfast");
  await card.locator("summary").click();
  await card.getByLabel(/Original pack photo/).setInputFiles({ name: "pack.png", mimeType: "image/png", buffer: pack });
  await card.getByRole("button", { name: "Upload pack photo" }).click();
  await expect(card.getByText("Pack image uploaded.")).toBeVisible();

  const ws = await develop(page, { product: "Breakfast Cookies, millet & oats, 240g", type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  await expect(ws.getByLabel("Pack in the image")).toHaveValue("layout");
  await makeImage(ws);
  await expect(ws.getByTestId("image-dims").first()).toContainText("1080×1350 · Feed 4:5 · original pack · brand panel");
  // A designed layout is never cropped into other sizes (that would cut the panel); Make all sizes lays each one out.
  await expect(ws.getByRole("button", { name: "All sizes" })).toHaveCount(0);
  await expect(ws.getByRole("button", { name: "Edit with words" })).toHaveCount(0);
  await expect(ws.getByLabel("Pack in the image").locator("option")).toHaveText(["Pack: real pack on a brand panel (recommended)", "Pack: real pack inside the scene (AI blends it; check it)", "No pack in this image"]);
  // The server refuses too.
  const assetUrl = await ws.getByTestId("image-gallery").locator("img").first().getAttribute("src");
  const res = await page.request.post("/api/image/edit", { data: { assetId: assetUrl!.split("/").pop(), instruction: "make it warmer" } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain("real pack");
});

test("Proposals show the real pack; a proposal image (with its hook) carries into the ad; the first image can be automatic, with its hook", async ({ page }) => {
  await signIn(page);
  await page.goto("/create");
  await fillBrief(page, { product: "Breakfast Cookies, millet & oats, 240g", type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  const first = page.getByTestId("proposal-0");
  await expect(first.getByTestId("proposal-pack")).toBeVisible({ timeout: 60_000 });
  await expect(first).toContainText("Sketch · not an AI image");
  await first.getByRole("button", { name: "Make a real image" }).click();
  await expect(first.getByTestId("proposal-image")).toBeVisible({ timeout: 60_000 });
  await first.getByRole("button", { name: /^Develop as/ }).click();
  const ws = page.getByTestId("workspace-creative");
  await expect(ws.getByTestId("image-gallery").locator("img")).toHaveCount(2, { timeout: 60_000 });
  await expect(ws.getByTestId("image-dims").first()).toContainText("1080×1350 · Feed 4:5 · original pack");
  await expect(ws.getByTestId("image-dims").nth(1)).toContainText("with text");
  await expect(page.getByTestId("creative-preview").locator("img")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("workspace-creative").getByTestId("image-gallery").locator("img")).toHaveCount(2);

  const auto = await develop(page, { product: "Breakfast Cookies, millet & oats, 240g", autoImage: true });
  await expect(auto.getByTestId("image-gallery").locator("img")).toHaveCount(2, { timeout: 60_000 });
  await expect(auto.getByTestId("image-dims").first()).toContainText("original pack");
  await expect(auto.getByTestId("image-dims").nth(1)).toContainText("with text");
});

test("A pack photo on a plain backdrop is cut out automatically on upload, with the original kept", async ({ page }) => {
  const sharp = (await import("sharp")).default;
  const box = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#2d1b54" } }).png().toBuffer();
  const photo = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#e8dcc8" } }).composite([{ input: box, left: 240, top: 160 }]).jpeg().toBuffer();
  await signIn(page);
  await page.goto("/admin");
  const card = page.getByTestId("product-pbu");
  await card.locator("summary").click();
  await card.getByLabel(/Original pack photo/).setInputFiles({ name: "pack-studio.jpg", mimeType: "image/jpeg", buffer: photo });
  await card.getByRole("button", { name: "Upload pack photo" }).click();
  await expect(card.getByText("background was removed automatically")).toBeVisible();
  await expect(card.getByTestId("pack-preview-pbu")).toBeVisible();
  const photos = card.getByTestId("photos-pbu");
  await expect(photos).toContainText("Pack photo (original background)");
  await expect(photos.getByRole("button", { name: "Use as pack" })).toBeVisible();
  const src = await card.getByTestId("pack-preview-pbu").getAttribute("src");
  const res = await page.request.get(src!);
  const meta = await sharp(await res.body()).metadata();
  expect(meta.hasAlpha).toBe(true);
  expect(meta.width! / meta.height!).toBeCloseTo(320 / 480, 1);


  // Keep just part of it by hand: the crop is saved as the pack, and later images use it as is.
  await card.getByRole("button", { name: "Adjust pack crop" }).click();
  const crop = card.getByRole("group", { name: /Crop the pack/ });
  await expect(crop.getByTestId("crop-box")).toBeVisible();
  await crop.getByLabel("Left %").fill("30");
  await crop.getByLabel("Top %").fill("20");
  await crop.getByLabel("Width %").fill("40");
  await crop.getByLabel("Height %").fill("60");
  await crop.getByRole("button", { name: "Use this as the pack" }).click();
  await expect(card.getByText("Saved: images now use just the pack.")).toBeVisible();
  await expect.poll(async () => (await card.getByTestId("pack-preview-pbu").getAttribute("src")) !== src).toBe(true);
  const cropped = await sharp(await (await page.request.get((await card.getByTestId("pack-preview-pbu").getAttribute("src"))!)).body()).metadata();
  expect([cropped.width, cropped.height]).toEqual([320, 480]);
});

test("Extra product photos can be placed instead of the pack", async ({ page }) => {
  const sharp = (await import("sharp")).default;
  const photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#c17d3c" } }).jpeg().toBuffer();
  await signIn(page);
  await page.goto("/admin");
  const card = page.getByTestId("product-bfast");
  await card.locator("summary").click();
  const photos = card.getByTestId("photos-bfast");
  await photos.getByLabel("What it shows").fill("Cookies out of the pack");
  await photos.getByLabel(/Product photo for/).setInputFiles({ name: "cookies.jpg", mimeType: "image/jpeg", buffer: photo });
  await photos.getByRole("button", { name: "Add photo" }).click();
  await expect(photos.getByText("Photo added.")).toBeVisible();
  await expect(photos.locator("img")).toHaveCount(1);

  const ws = await develop(page, { product: "Breakfast Cookies, millet & oats, 240g", type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  await ws.getByLabel("Which product photo").selectOption({ label: "Photo: Cookies out of the pack" });
  await makeImage(ws);
  await expect(ws.getByTestId("image-dims").first()).toContainText("original pack");
});

test("Competitors: found automatically for a product category, broken down, and used in a brief", async ({ page }) => {
  await signIn(page);
  await page.goto("/competitors");
  await expect(page.getByTestId("competitors-empty")).toBeVisible();
  const find = page.getByRole("form", { name: "Find competitors" });
  await expect(find.getByLabel("Category to search")).toHaveValue("breakfast cookies, millet & oats");
  await find.getByLabel("Our product").selectOption({ label: "Chocolate Cookies, millet & oats, 240g" });
  await expect(find.getByLabel("Category to search")).toHaveValue("chocolate cookies, millet & oats");
  await find.getByLabel("Look at").selectOption({ label: "The claims they make" });
  await find.getByText("3", { exact: true }).click();
  await find.getByRole("button", { name: "Find competitors" }).click();
  await expect(page.getByTestId("research-summary")).toContainText("Found 3 new competitors", { timeout: 60_000 });
  await expect(page.getByTestId("research-summary")).toContainText("Mock mode: sample brands, no web search ran.");
  await expect(page.getByTestId("competitor")).toHaveCount(3);
  await expect(page.getByTestId("competitor-analysis")).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByTestId("competitor").first()).toContainText("found by web research");
  await expect(page.getByTestId("competitor").first().getByTestId("competitor-claims")).toContainText("we can't say this");

  // How it's used: every brief for this product stands apart from them…
  await expect(page.getByTestId("how-used")).toContainText("Every new idea stands apart");
  await page.goto("/create");
  await fillBrief(page, { product: "Chocolate Cookies, millet & oats, 240g" });
  const context = page.getByTestId("competitive-context");
  await expect(context).toContainText("Stand apart from the 3 competitors we researched");
  await expect(context.getByTestId("landscape-preview")).toContainText("The healthy cookie your family deserves");
  await fillBrief(page, { product: "Peanut Butter Unsweetened 500g" });
  await expect(page.getByTestId("landscape-missing")).toBeVisible();
  // The focus list only offers competitors of the selected product.
  await expect(page.getByLabel(/Focus on one competitor/)).toHaveCount(0);
  await fillBrief(page, { product: "Chocolate Cookies, millet & oats, 240g" });
  const withLandscape = page.waitForRequest((r) => r.url().endsWith("/api/generate") && (r.postData() ?? "").includes('"useLandscape":true'));
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  await withLandscape;
  await expect(page.getByTestId("proposal-2")).toBeVisible({ timeout: 60_000 });

  // …their weak spots become ideas we can develop in one click…
  await page.goto("/competitors");
  await page.getByTestId("competitor").first().getByRole("link", { name: "Develop this idea" }).nth(1).click();
  await expect(page.getByTestId("ideas-from")).toContainText("Sample Brand");
  await expect(page.getByTestId("proposal-0")).toContainText("4:30 slump");
  await page.getByLabel("Make the first image automatically").uncheck();
  await page.getByTestId("proposal-0").getByRole("button", { name: /^Develop as/ }).click();
  await expect(page.getByTestId("workspace-creative")).toBeVisible({ timeout: 60_000 });

  // …and copy that echoes a competitor needs an approver.
  const insp = inspector(page);
  await insp.getByRole("tab", { name: "Edit" }).click();
  await insp.getByLabel("Hook (first 2 seconds)").fill("The cookie your family deserves, honestly");
  await waitSaved(page);
  await insp.getByRole("tab", { name: "Check" }).click();
  await expect(insp.getByTestId("issues-review")).toContainText("Sounds like a competitor");

  await page.goto("/competitors");
  const find2 = page.getByRole("form", { name: "Find competitors" });
  await find2.getByLabel("Our product").selectOption({ label: "Chocolate Cookies, millet & oats, 240g" });
  await find2.getByText("3", { exact: true }).click();
  await expect(page.getByTestId("saved-research")).toContainText("Nobody owns yet");
  // Searching again skips brands already on the list.
  await find2.getByRole("button", { name: "Find competitors" }).click();
  await expect(page.getByTestId("research-summary")).toContainText("No new competitors found", { timeout: 60_000 });
  await expect(page.getByTestId("competitor")).toHaveCount(3);

  // Meta Ad Library: one click to their running ads in India, then their screenshots re-run the breakdown.
  const card = page.getByTestId("competitor").first();
  const href = await card.getByTestId("ad-library").getByRole("link", { name: /Open in Meta Ad Library/ }).getAttribute("href");
  expect(href).toContain("facebook.com/ads/library");
  expect(href).toContain("country=IN");
  expect(href).toContain("active_status=active");
  const sharp = (await import("sharp")).default;
  const shot = await sharp({ create: { width: 500, height: 900, channels: 3, background: "#d7c4a3" } }).png().toBuffer();
  await card.getByLabel(/Screenshots of .*ads/).setInputFiles([
    { name: "ad1.png", mimeType: "image/png", buffer: shot },
    { name: "ad2.png", mimeType: "image/png", buffer: shot },
  ]);
  await expect(card.getByRole("img", { name: /Screenshot of the/ })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId("competitor-analysis")).toBeVisible({ timeout: 60_000 });

  // Adding one by hand still works.
  await page.getByText("Add one yourself").click();
  const form = page.getByRole("form", { name: "Add a competitor ad" });
  await form.getByLabel("Our product it competes with").selectOption({ label: "Chocolate Cookies, millet & oats, 240g" });
  await form.getByLabel("Brand").fill("Crunchy Co");
  await form.getByLabel("Link").fill("ftp://nope");
  await form.getByRole("button", { name: "Save and analyse" }).click();
  await expect(form.getByRole("alert")).toContainText("must start with http");
  await form.getByLabel("Link").fill("");
  await form.getByLabel("Ad text").fill("The healthy cookie your family deserves!");
  await form.getByRole("button", { name: "Save and analyse" }).click();
  await expect(page.getByTestId("competitor")).toHaveCount(4, { timeout: 30_000 });

  await page.getByTestId("competitor").last().getByRole("link", { name: "Use in a brief" }).click();
  await page.locator("form[aria-label=Brief][data-ready]").waitFor();
  await expect(page.getByLabel(/Focus on one competitor/)).not.toHaveValue("");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/generate") && (r.postData() ?? "").includes('"competitorId"'));
  await page.getByLabel("Make the first image automatically").uncheck();
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  await sent;
  await expect(page.getByTestId("proposal-2")).toBeVisible({ timeout: 60_000 });
});

test("Amazon: see what's working (top listings + playbook) and use it in Amazon briefs", async ({ page }) => {
  await signIn(page);
  await page.goto("/create");
  await fillBrief(page, { platform: "Amazon" });
  await expect(page.getByTestId("playbook-missing")).toBeVisible();

  await page.goto("/competitors");
  const find = page.getByRole("form", { name: "Find competitors" });
  await find.getByLabel("Our product").selectOption({ label: "Chocolate Cookies, millet & oats, 240g" });
  await find.getByLabel("Where to look").selectOption({ label: "Amazon.in: what's selling and why" });
  await expect(find.getByLabel("Look at")).toHaveCount(0);
  await find.getByText("3", { exact: true }).click();
  await find.getByRole("button", { name: "See what's working on Amazon" }).click();
  await expect(page.getByTestId("research-summary")).toContainText("Studied 3 Amazon listings", { timeout: 60_000 });
  const playbook = page.getByTestId("playbook-amazon");
  await expect(playbook).toContainText("Title formula");
  await expect(playbook).toContainText("Image stack, in order");
  await expect(playbook).toContainText("Do this for our listing and ads");
  await expect(page.getByTestId("listing-facts")).toHaveCount(3);
  await expect(page.getByTestId("listing-facts").first()).toContainText("per 100 g");
  await expect(page.getByTestId("competitor-analysis")).toHaveCount(await page.getByTestId("competitor").count(), { timeout: 60_000 });

  await page.goto("/create");
  await fillBrief(page, { platform: "Amazon" });
  const toggle = page.getByTestId("playbook-toggle");
  await expect(toggle).toContainText("Use what's working on Amazon");
  await expect(toggle.getByRole("checkbox")).toBeChecked();
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/generate") && (r.postData() ?? "").includes('"usePlaybook":true'));
  await page.getByRole("button", { name: "Propose 3 concepts" }).click();
  await sent;
  await expect(page.getByTestId("proposal-2")).toBeVisible({ timeout: 60_000 });
  // Flipkart has no research yet.
  await fillBrief(page, { platform: "Flipkart" });
  await expect(page.getByTestId("playbook-missing")).toContainText("No Flipkart research");
  await fillBrief(page, { platform: "Instagram & Facebook" });
});

test("Research: one run finds competitors per platform and proposes ideas for each, ready to develop", async ({ page }) => {
  await signIn(page);
  await page.goto("/research");
  const form = page.getByRole("form", { name: "Research a product" });
  await form.getByLabel("Product").selectOption({ label: "Ragi & Cocoa Peanut Butter with jaggery 500g" });
  await expect(page.getByTestId("research-empty")).toBeVisible();
  await expect(page.getByTestId("research-known")).toContainText("Known so far: 0 competitors");
  await form.getByText("3", { exact: true }).click();
  await form.getByRole("button", { name: "Research and propose ideas" }).click();
  const steps = page.getByTestId("research-steps");
  await expect(steps.locator("li")).toHaveCount(7);
  await expect(steps.locator('li[data-status="done"]')).toHaveCount(7, { timeout: 120_000 });
  for (const pl of ["meta", "amazon", "flipkart"]) await expect(page.getByTestId(`ideas-${pl}`).getByTestId("research-idea")).toHaveCount(3);
  await expect(page.getByTestId("ideas-meta").getByTestId("research-idea").first()).toContainText("Adapts:");
  await expect(page.getByTestId("ideas-meta").getByTestId("research-idea").nth(1)).toContainText("Open ground:");
  await expect(page.getByTestId("research-known")).toContainText("Known so far: 9 competitors");

  // Develop an Amazon idea: Create opens with the product, platform and the ideas ready.
  await page.getByTestId("ideas-amazon").getByRole("link", { name: "Develop" }).nth(1).click();
  await expect(page.getByTestId("ideas-from")).toContainText("Amazon");
  await expect(page.getByLabel("Type of ad", { exact: true })).not.toHaveValue("9:16 UGC-style video (15–30s)");
  await expect(page.getByTestId("proposal-0").getByTestId("based-on")).toBeVisible();
  await page.getByLabel("Make the first image automatically").uncheck();
  await page.getByTestId("proposal-0").getByRole("button", { name: /^Develop as/ }).click();
  const ws = page.getByTestId("workspace-creative");
  await expect(ws).toBeVisible({ timeout: 60_000 });
  await expect(ws).toContainText("Amazon");
  await expect(ws).toContainText("Ragi & Cocoa Peanut Butter");
});

test("No pack photo, no pack: the app asks for the real photo instead of letting the AI invent one", async ({ page }) => {
  await signIn(page);
  const ws = await develop(page, { product: "PuŕGrain Millet Bar, 10g protein" });
  await makeImage(ws);
  await expect(ws.getByRole("alert")).toContainText("no pack photo for");
  await expect(ws.getByTestId("image-gallery")).toHaveCount(0);
  await ws.getByLabel("Pack in the image").selectOption("none");
  await makeImage(ws);
  await expect(ws.getByTestId("image-gallery").locator("img")).toHaveCount(1);
});

test("Image prompts: the brand image style is used, and the team can see and edit the direction (rules always stay)", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin#image-style");
  const style = page.getByTestId("image-style");
  await style.getByLabel("Places and settings").fill("Mumbai local trains, office pantries and balconies at golden hour");
  await style.getByRole("button", { name: "Save image style" }).click();
  await expect(style.getByText("Image style saved.")).toBeVisible();

  const ws = await develop(page, { type: "Static image ad (4:5)", placement: "Instagram Feed post" });
  const editor = ws.getByTestId("prompt-editor");
  await editor.getByRole("button", { name: /Prompt/ }).click();
  const direction = editor.getByLabel(/What the picture shows/);
  await expect(direction).toHaveValue(/Places: Mumbai local trains, office pantries and balconies at golden hour/);
  await editor.getByText("Rules always added").click();
  await expect(editor).toContainText("Do NOT show any product pack");
  await direction.fill("A commuter on a Mumbai local at 8am, window light, holding a steel tumbler of chai");
  await editor.getByRole("button", { name: "Use this for the next images" }).click();
  await expect(editor.getByRole("button", { name: /Prompt/ })).toContainText("edited");
  await makeImage(ws);
  await expect(ws.getByTestId("image-gallery").locator("img")).toHaveCount(1);
  await editor.getByRole("button", { name: "Reset to the app's version" }).click();
  await expect(direction).toHaveValue(/Places: Mumbai local trains/);
});

test("Roles: a viewer can look but not create; the server refuses too", async ({ page, browser }) => {
  await signIn(page);
  await page.goto("/admin#roles");
  await expect(page.getByTestId("roles-off")).toBeVisible();
  const form = page.getByTestId("role-form");
  await form.getByLabel("Email").fill("viewer-v@team.studio");
  await form.getByLabel("Role").selectOption("viewer");
  await form.getByRole("button", { name: "Save role" }).click();
  await expect(form.getByText("is now viewer")).toBeVisible();
  await page.reload();
  // Whoever turns roles on stays an admin.
  await expect(page.getByTestId("roles-list")).toContainText("e2e@example.com");
  await expect(page.getByTestId("role-chip")).toHaveText("Admin");

  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await v.goto("/login");
  await v.getByLabel(/Your name/).fill("Viewer V");
  await v.getByLabel("Team password").fill("e2e-team-password");
  await v.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await v.waitForURL("**/create");
  await expect(v.getByTestId("role-chip")).toHaveText("Viewer");
  await expect(v.getByRole("button", { name: "Propose 3 concepts" })).toBeDisabled();
  const res = await v.request.post("/api/generate", { data: { mode: "proposals", platform: "meta", productId: "00000000-0000-0000-0000-000000000000", creativeType: "x", angle: "auto", persona: "auto", language: "English" } });
  expect(res.status()).toBe(403);
  await v.goto("/admin");
  await expect(v.getByText("only admins can change them")).toBeVisible();
  await v.goto("/competitors");
  await expect(v.getByText("Your role can view competitor ads but not add them.")).toBeVisible();
  await expect(v.getByRole("button", { name: "Analyse again" })).toHaveCount(0);
  await ctx.close();
});
