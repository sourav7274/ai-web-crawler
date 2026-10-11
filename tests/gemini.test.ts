import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: mocks.generate }; } }));
import { summarizeText } from "../src/lib/server/gemini";
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only-key"); vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash-lite"); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Gemini summarization", () => {
  it("passes extracted text, requests grounded JSON, and validates the output", async () => {
    const summary = { overview: "A clear overview.", keyPoints: ["One.", "Two.", "Three."] };
    mocks.generate.mockResolvedValue({ text: JSON.stringify(summary) });
    expect(await summarizeText("Scraped page", "Page title")).toEqual(summary);
    const input = mocks.generate.mock.calls[0][0];
    expect(JSON.parse(input.contents).pageText).toBe("Scraped page");
    expect(input.config.systemInstruction).toContain("untrusted source data");
    expect(input.config.responseMimeType).toBe("application/json");
  });
  it("does not call the provider without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(summarizeText("Text", "Title")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each(["", "not JSON", '{"overview":"Text","keyPoints":[]}'])("rejects invalid output %s", async (text) => {
    mocks.generate.mockResolvedValue({ text });
    await expect(summarizeText("Text", "Title")).rejects.toMatchObject({ code: "INVALID_SUMMARY" });
  });
  it.each([[429, "AI_QUOTA"], [403, "AI_CONFIGURATION"], [404, "AI_CONFIGURATION"], [500, "AI_UNAVAILABLE"]])("maps provider status %s without leaking secrets", async (status, code) => {
    mocks.generate.mockRejectedValue({ status, message: "secret provider details" });
    await expect(summarizeText("Text", "Title")).rejects.toMatchObject({ code });
  });
  it("maps provider timeouts", async () => {
    mocks.generate.mockRejectedValue(new Error("Request timed out"));
    await expect(summarizeText("Text", "Title")).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });
});
