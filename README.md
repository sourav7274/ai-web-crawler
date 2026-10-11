# PageBrief — Full-Stack AI Web Scraper

Paste a public webpage URL and receive a short overview with 3–5 key points. Built with Next.js, TypeScript, a Node.js API route, Cheerio, and Google's Gemini API.

## Run frontend and backend locally

**Prerequisites:** Node.js 22.12 or newer and npm. Use a current patched Node.js 22 LTS release.

1. Clone this repository, open its folder in a terminal, and run `npm ci`.
2. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). Use a project on the Gemini **free tier**; paid OpenAI keys are not used.
3. Copy `.env.example` to **`.env.local` in the repository root**, next to `package.json`.

   PowerShell: `Copy-Item .env.example .env.local`

   macOS/Linux: `cp .env.example .env.local`

4. Edit `.env.local`:

   ```dotenv
   GEMINI_API_KEY=your_actual_key_here
   GEMINI_MODEL=gemini-2.5-flash-lite
   ```

5. Run `npm run dev` and open **http://localhost:3000**.

**This single command starts both the frontend and backend.** The frontend is at `/`; the backend is at `/api/summarize`. There is no separate Express server or second installation. Restart the server after editing environment variables.

For a local production run: `npm run build`, then `npm start`.

Never put the API key in a `NEXT_PUBLIC_*` variable. Secret environment files are ignored by Git. Gemini free-tier availability and quotas depend on your project and model; check [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). Model selection is configurable, with no automatic paid-provider fallback.

## How it works

1. The browser sends `POST /api/summarize` with a JSON body.
2. The server validates the URL and DNS addresses, fetches basic HTML, and checks every redirect.
3. Cheerio removes boilerplate and extracts article/main text, falling back to body text.
4. Gemini receives the extracted text and produces structured JSON. The server validates that output.
5. The UI displays the source, page title, overview, and key points.

The key stays on the server. Extracted text and summaries are not stored in a database. Page text is sent to Google for summarization; Google's free-tier data terms apply.

### API

```http
POST /api/summarize
Content-Type: application/json

{"url":"https://www.iana.org/help/example-domains"}
```

Successful response:

```json
{
  "title": "Example Domains",
  "sourceUrl": "https://www.iana.org/help/example-domains",
  "overview": "A short overview based on the fetched page.",
  "keyPoints": ["First point.", "Second point.", "Third point."],
  "truncated": false
}
```

The response above illustrates the format, not a recorded AI result.

Failures return `{ "error": { "code": "...", "message": "..." } }`. Status codes include 400 for invalid/unsafe URLs, 413 for oversized input/pages, 415 for unsupported request content types, 422 for unreadable content, 429 for Gemini quota exhaustion, 502 for upstream failures, 503 for missing/invalid AI configuration, and 504 for timeouts.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Browser tests start the production server, so build first and leave port 3000 free. They cover desktop/mobile, keyboard submission, loading, copying, errors, truncation, overflow, plain-text output, and real API URL rejection. Successful AI responses in these browser tests are mocked.

Run `npm run test:scrape` to check real HTML extraction without an AI key. With a valid key in `.env.local`, `npm run test:live` fetches two real HTML pages and calls Gemini. This uses your free quota. Mocked tests do not prove real-provider or deployed behavior.

## Deploy on Vercel

1. Push this project to a **public GitHub repository**.
2. In [Vercel](https://vercel.com/new), import the repository and keep the detected **Next.js** preset and root directory.
3. Select Node.js **22.x**, keeping the default install/build settings.
4. Add `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-2.5-flash-lite` in Vercel's environment settings for Production (and Preview if wanted). Enter the key in Vercel, never GitHub.
5. Deploy. If environment variables change afterward, redeploy.
6. Open the deployed URL and summarize a public article. Check a failed URL too, then submit the public repository URL and production URL.

Vercel deploys the frontend and Node.js route together. The API declares a 60-second maximum duration; upstream requests use shorter deadlines.

## Limitations

- One page per request; no multi-page crawl, history, accounts, or database.
- Basic HTML only: no browser rendering, authentication, paywall bypass, or bot-protection bypass.
- HTTP/HTTPS on standard ports; private, loopback, link-local, multicast, and reserved addresses are blocked, including DNS answers and redirects.
- Three redirects maximum, 10-second scraping deadline, 2 MB HTML limit (compressed and decompressed), 30,000-character AI input limit, and 25-second Gemini request timeout with retries disabled.
- Long pages are truncated with a visible notice. Extraction is heuristic and may retain some boilerplate.
- AI summaries can omit details or make mistakes; verify against the linked source.
- There is no distributed application rate limiter. A public demo can exhaust the Gemini free quota; provider quota errors are displayed clearly.
- At initial verification, `npm audit --omit=dev` reported no vulnerabilities. Full audit reported an unresolved `braces` advisory in Next.js's development lint dependency chain; no framework downgrade or forced dependency replacement was applied.

## Submission links

- Public repository: [sourav7274/ai-web-crawler](https://github.com/sourav7274/ai-web-crawler)
- Vercel deployment: deferred at the owner's request; no live URL yet.
- Real Gemini verification: pending a valid key in the local environment.
