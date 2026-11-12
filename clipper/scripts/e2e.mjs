// Browser journey through the real app. Needs the backend running with the built frontend, and Playwright.
//   python -m tests.sample_media /tmp/clipper-media        (from backend/, makes sample.mp4 + sample.srt)
//   node scripts/e2e.mjs http://127.0.0.1:8000 /tmp/clipper-media [screenshot-dir]
// Whisper is not exercised here: the transcript comes from the .srt so the run needs no model download.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright"); // works with a global or local install
const [base = "http://127.0.0.1:8000", media = "/tmp/clipper-media", shots] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(String(e)));
page.on("dialog", (d) => d.accept());
const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });
const nav = (name) => page.getByRole("navigation").getByRole("link", { name, exact: true });
const step = (s) => console.log("ok -", s);

await page.goto(base);
await page.getByText("Total projects").waitFor();
await shot("01-dashboard-empty");
step("dashboard loads");

await nav("New Project").click();
await page.locator('input[type=file]').setInputFiles(path.join(media, "sample.mp4"));
assert.equal(await page.getByPlaceholder("Podcast episode 12").inputValue(), "sample"); // name suggested from file
await page.getByRole("button", { name: "Create project and import" }).click();
await page.waitForURL(/\/projects\/\d+$/);
await page.getByText("640×360").waitFor();
step("video imported with metadata");

await page.locator('input[accept=".srt,.vtt"]').setInputFiles(path.join(media, "sample.srt"));
await page.getByText("Why do most people fail at saving money?").first().waitFor();
await page.getByRole("link", { name: /AI Clips \([1-9]/ }).waitFor({ timeout: 60000 });
await shot("02-project");
step("transcript shown and highlights found");

await page.getByRole("link", { name: /AI Clips \(/ }).click();
await page.getByText("Clip #1").waitFor();
assert.ok((await page.getByText(/^Why:/).count()) >= 2, "several explained candidates");
await shot("03-ai-clips");
await page.getByRole("button", { name: "Preview" }).first().click();
await page.getByText(/Playing the original video/).waitFor();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Reject" }).last().click();
await page.getByText("Show rejected (1)").waitFor();
step("candidates ranked, previewed, one rejected");

await page.getByRole("button", { name: "Accept and edit" }).first().click();
await page.waitForURL(/\/editor\/\d+$/);
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForTimeout(1500);
const t1 = await page.locator("video").evaluate((v) => v.currentTime);
await page.getByRole("button", { name: "Pause", exact: true }).click();
const start = Number(await page.getByLabel("Start (seconds)").inputValue().catch(() => "0"));
assert.ok(t1 > start + 0.5, `preview plays inside the clip (t=${t1}, start=${start})`);
step("preview plays");

await page.getByRole("tab", { name: "Captions" }).click();
await page.locator("main").getByLabel("Template").selectOption("yellow_highlight");
const firstWord = page.getByLabel("Caption word").first();
await firstWord.fill("EDITED");
await page.getByText("all changes saved").waitFor();
await page.getByRole("tab", { name: "Trim" }).click();
const end = page.getByLabel("End (seconds)");
const endBefore = Number(await end.inputValue());
await end.fill(String(endBefore - 1));
await page.getByText("all changes saved").waitFor();
await page.reload();
await page.getByRole("tab", { name: "Captions" }).click();
assert.equal(await page.getByLabel("Caption word").first().inputValue(), "EDITED"); // survived reload = saved in the database
assert.equal(await page.locator("main").getByLabel("Template").inputValue(), "yellow_highlight");
await shot("04-editor-captions");
step("caption edit, template and trim persist across reload");

await page.getByRole("tab", { name: "Frame" }).click();
await page.getByLabel("How to fit the video").selectOption("blur");
await page.getByRole("tab", { name: "Export" }).click();
await page.getByLabel("Quality preset").selectOption({ label: "Fast draft 720p (720p, H.264 + AAC)" });
await page.getByRole("button", { name: "Render MP4" }).click();
await page.getByRole("link", { name: /Download latest export/ }).waitFor({ timeout: 180000 });
await page.getByRole("button", { name: "Rendered export" }).click();
const dims = await page.locator("video").evaluate((v) => new Promise((r) => (v.readyState >= 1 ? r([v.videoWidth, v.videoHeight]) : (v.onloadedmetadata = () => r([v.videoWidth, v.videoHeight])))));
assert.deepEqual(dims, [720, 1280]);
await page.locator("video").evaluate((v) => { v.currentTime = 2; });
await page.waitForTimeout(800);
await shot("05-editor-rendered");
step("clip rendered to 9:16 and plays in the browser");

await nav("Campaigns").click();
await page.getByRole("button", { name: "Add a campaign" }).click();
await page.getByLabel("Campaign name").fill("Spring launch");
await page.getByLabel("Allowed platforms").fill("TikTok");
await page.getByLabel("Maximum clip length (s)").fill("60");
await page.getByLabel("Rate per 1,000 views").fill("2");
await page.getByPlaceholder("#brand").fill("#brandx");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.getByRole("button", { name: "Save campaign" }).click();
await page.getByRole("button", { name: "Record submission" }).click();
await page.getByRole("dialog").locator("select").first().selectOption({ index: 1 });
await page.getByLabel("Caption you posted").fill("out now #brandx");
await page.getByLabel("Status").selectOption("submitted");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByText("Caption has #brandx").waitFor();
await page.getByRole("spinbutton", { name: "View count" }).fill("12000");
await page.getByRole("button", { name: "Record", exact: true }).click();
await page.getByText("USD 24.00").waitFor();
await shot("06-campaigns");
step("campaign, submission, checklist and estimate");

await nav("Earnings").click();
await page.locator("main select").first().selectOption({ label: "Spring launch" });
await page.getByLabel("Amount", { exact: true }).fill("10");
await page.getByRole("button", { name: "Record payment" }).click();
await page.getByText("Payment recorded").waitFor();
await page.getByText("USD 10.00").first().waitFor();
await shot("07-earnings");
step("payment recorded; estimate and received shown separately");

for (const [link, text] of [["Templates", "Bold Impact"], ["Settings", "Speech recognition"], ["Video Editor", "Pick a clip"], ["My Projects", "sample"], ["Dashboard", "Recent processing activity"]]) {
  await nav(link).click();
  await page.getByText(text).first().waitFor();
  await shot(`08-${link.toLowerCase().replace(/ /g, "-")}`);
}
step("all nine sections load");

await browser.close();
assert.deepEqual(problems, [], "no browser console errors");
console.log("PASS");
