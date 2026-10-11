import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/server/scraper", async (original) => ({ ...await original<typeof import("../src/lib/server/scraper")>(), scrapePage: vi.fn() }));
vi.mock("../src/lib/server/gemini", () => ({ summarizeText: vi.fn() }));
import { scrapePage } from "../src/lib/server/scraper";
import { summarizeText } from "../src/lib/server/gemini";
import { AppError } from "../src/lib/contracts";
import { POST } from "../src/app/api/summarize/route";
function request(body: string, headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Request("https://pagebrief.example/api/summarize", { method: "POST", headers, body });
}
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only-key"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("summarize API", () => {
  it("returns a sourced structured summary without scraped text", async () => {
    vi.mocked(scrapePage).mockResolvedValue({ title: "Web", text: "Source text", sourceUrl: "https://example.com/article", truncated: false });
    vi.mocked(summarizeText).mockResolvedValue({ overview: "Overview", keyPoints: ["A", "B", "C"] });
    const response = await POST(request('{"url":"https://example.com/article"}'));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ title: "Web", sourceUrl: "https://example.com/article", truncated: false, overview: "Overview", keyPoints: ["A", "B", "C"] });
    expect(summarizeText).toHaveBeenCalledWith("Source text", "Web");
  });
  it.each(["invalid JSON", "{}", '{"url":"file:///etc/passwd"}', '{"url":"http://127.0.0.1"}', '{"url":123}'])("rejects invalid input %s before fetching", async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(scrapePage).not.toHaveBeenCalled();
  });
  it("rejects large bodies without trusting content-length", async () => {
    expect((await POST(request(JSON.stringify({ url: "x".repeat(5000) })))).status).toBe(413);
  });
  it("rejects cross-origin submissions and wrong content types", async () => {
    expect((await POST(request('{"url":"https://example.com"}', { "content-type": "application/json", origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request("test", { "content-type": "text/plain" }))).status).toBe(415);
  });
  it("reports missing configuration before scraping", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(request('{"url":"https://example.com"}'));
    expect(response.status).toBe(503); expect(scrapePage).not.toHaveBeenCalled();
  });
  it("preserves safe errors", async () => {
    vi.mocked(scrapePage).mockRejectedValue(new AppError("SCRAPE_TIMEOUT", "Try again.", 504));
    const response = await POST(request('{"url":"https://example.com"}'));
    expect(response.status).toBe(504); expect(await response.json()).toEqual({ error: { code: "SCRAPE_TIMEOUT", message: "Try again." } });
  });
});
