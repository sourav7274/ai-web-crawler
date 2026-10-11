import { test, expect } from "@playwright/test";
const summary = {
  title: "How a webpage works", sourceUrl: "https://example.com/article", truncated: false,
  overview: "A webpage uses HTML to organize content, CSS to control presentation, and JavaScript to respond to user actions.",
  keyPoints: ["HTML describes a document's structure.", "CSS defines a page's appearance.", "JavaScript adds interactive behavior."],
};
test("keyboard submission, loading, result, source, and copy", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/summarize", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ url: "https://example.com/article" });
    await gate;
    await route.fulfill({ json: summary });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Summarize", exact: true })).toBeDisabled();
  const input = page.getByRole("textbox", { name: "Webpage URL" });
  await input.fill("https://example.com/article");
  await input.press("Enter");
  await expect(page.getByText("Loading… fetching the page and finding its essential ideas.")).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(page.getByRole("button", { name: "Summarizing…" })).toBeDisabled();
  release();
  await expect(page.getByRole("heading", { name: summary.title })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("link", { name: /example.com/ })).toHaveAttribute("href", summary.sourceUrl);
  await page.getByRole("button", { name: "Copy brief" }).click();
  await expect(page.getByText("Copied to clipboard")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(summary.overview);
  await page.screenshot({ path: testInfo.outputPath("summary-result.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("error recovery and truncation", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/summarize", async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 429, json: { error: { code: "AI_QUOTA", message: "Free quota exhausted. Try again later." } } });
    else await route.fulfill({ json: { ...summary, truncated: true, title: "A".repeat(250) } });
  });
  await page.goto("/");
  await page.getByLabel("Webpage URL").fill("https://example.com/article");
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.getByRole("region", { name: "Page summary" }).getByRole("alert")).toContainText("Free quota exhausted");
  await expect(page.getByLabel("Webpage URL")).toBeEnabled();
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.getByText(/first 30,000 characters/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("renders generated HTML as harmless text", async ({ page }) => {
  await page.route("**/api/summarize", (route) => route.fulfill({ json: { ...summary, overview: '<img src=x onerror="alert(1)"> ' + summary.overview } }));
  await page.goto("/");
  await page.getByLabel("Webpage URL").fill("https://example.com/article");
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.locator(".overview")).toContainText("<img");
  await expect(page.locator(".summary-result img")).toHaveCount(0);
});
test("real API rejects private URLs", async ({ request }) => {
  const response = await request.post("/api/summarize", { data: { url: "http://127.0.0.1" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("UNSAFE_URL");
});
test("empty-state screenshot and responsive overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A whole page. The essential ideas." })).toBeVisible();
  for (const width of testInfo.project.name === "mobile" ? [320, 375] : [768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("empty-state.png"), fullPage: true });
});
