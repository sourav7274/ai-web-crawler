import { AppError, requestSchema } from "@/lib/contracts";
import { scrapePage, validateUrl } from "@/lib/server/scraper";
import { summarizeText } from "@/lib/server/gemini";
export const runtime = "nodejs";
export const maxDuration = 60;
async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError("INVALID_REQUEST", "Send a JSON body containing a URL.", 415);
  if (!request.body) throw new AppError("INVALID_REQUEST", "Provide a webpage URL.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new AppError("REQUEST_TOO_LARGE", "The request is too large. Send only a webpage URL.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AppError("INVALID_REQUEST", "Send valid JSON containing a URL.", 400); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AppError("INVALID_ORIGIN", "Submit your URL from this app.", 403);
    const input = requestSchema.safeParse(await readJson(request));
    if (!input.success) throw new AppError("INVALID_URL", "Provide a webpage URL of at most 2,048 characters.", 400);
    validateUrl(input.data.url);
    if (!process.env.GEMINI_API_KEY?.trim()) throw new AppError("NOT_CONFIGURED", "The summary service is not configured yet. Add the server's Gemini API key to enable summaries.", 503);
    const page = await scrapePage(input.data.url);
    const summary = await summarizeText(page.text, page.title);
    return Response.json({ title: page.title, sourceUrl: page.sourceUrl, truncated: page.truncated, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeError = error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
    console.error("Summarize failed:", safeError.code);
    return Response.json({ error: { code: safeError.code, message: safeError.message } }, { status: safeError.status, headers: { "Cache-Control": "no-store" } });
  }
}
