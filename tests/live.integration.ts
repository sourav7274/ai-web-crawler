import { describe, expect, it } from "vitest";
import { scrapePage } from "../src/lib/server/scraper";
import { summarizeText } from "../src/lib/server/gemini";
describe("real HTML scraping and Gemini", () => {
  it.each(["https://example.com", "https://www.iana.org/help/example-domains"])("summarizes %s", async (url) => {
    const page = await scrapePage(url);
    expect(page.text.length).toBeGreaterThan(100);
    const summary = await summarizeText(page.text, page.title);
    expect(summary.overview.length).toBeGreaterThan(20);
    expect(summary.keyPoints.length).toBeGreaterThanOrEqual(3);
    // Qualitative source check for these two domain-information pages.
    expect((summary.overview + " " + summary.keyPoints.join(" ")).toLowerCase()).toContain("domain");
  });
});

it.each(["https://example.com", "https://www.iana.org/help/example-domains"])("extracts real HTML from %s", async (url) => {
  const page = await scrapePage(url);
  expect(page.text.length).toBeGreaterThan(100);
  expect(page.text.toLowerCase()).toContain("domain");
  expect(page.title.length).toBeGreaterThan(0);
});
