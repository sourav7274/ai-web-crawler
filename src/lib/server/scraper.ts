import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import { AppError } from "../contracts";

export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_CHARS = 30_000;
const blocked = () => new AppError("UNSAFE_URL", "Use a public webpage URL. Local and private addresses are not supported.", 400);

export function validateUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch {
    throw new AppError("INVALID_URL", "Enter a complete URL starting with https:// or http://.", 400);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw blocked();
  if (url.port && !["80", "443"].includes(url.port)) throw blocked();
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw blocked();
  if (isIP(host) && !isPublicAddress(host)) throw blocked();
  url.hash = "";
  return url;
}
export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
type Address = { address: string; family: number };
export async function resolvePublicAddress(url: URL, signal: AbortSignal): Promise<Address> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await new Promise<Address[]>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.throwIfAborted();
      signal.addEventListener("abort", abort, { once: true });
      lookup(hostname, { all: true, verbatim: true }).then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw blocked();
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}
type PageResponse = { status: number; location?: string; html: string };
export function readPage(url: URL, address: Address, signal: AbortSignal): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    // Connect to the checked IP, preserving Host and TLS SNI. No second DNS lookup.
    const options: https.RequestOptions = {
      hostname: address.address, family: address.family,
      servername: url.hostname.replace(/^\[|\]$/g, ""), agent: false, signal,
      headers: { Host: url.host, "User-Agent": "PageBrief/1.0 (HTML summarizer)", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "gzip, deflate, br" },
    };
    const request = transport.request(url, options, async (response) => {
      const status = response.statusCode ?? 502;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy(); resolve({ status, location: response.headers.location, html: "" }); return;
      }
      if (status < 200 || status >= 300) {
        response.destroy(); reject(new AppError("PAGE_UNAVAILABLE", "This page could not be accessed. Try another public webpage.", 502)); return;
      }
      if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.headers["content-type"] ?? "")) {
        response.destroy(); reject(new AppError("NOT_HTML", "This URL is not an HTML webpage. Try an article or website page.", 422)); return;
      }
      const encoding = response.headers["content-encoding"]?.toLowerCase();
      const decoder = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : undefined;
      if (encoding && encoding !== "identity" && !decoder) {
        response.destroy(); reject(new AppError("UNSUPPORTED_ENCODING", "This page uses an unsupported format. Try another page.", 422)); return;
      }
      const stream = decoder ? response.pipe(decoder) : response;
      const failStream = (error: Error) => stream.destroy(error);
      if (decoder) response.on("error", failStream);
      let rawSize = 0;
      response.on("data", (chunk: Buffer) => {
        rawSize += chunk.length;
        if (rawSize > MAX_HTML_BYTES) stream.destroy(new AppError("PAGE_TOO_LARGE", "This page is too large. Try a smaller article.", 413));
      });
      try {
        if (Number(response.headers["content-length"]) > MAX_HTML_BYTES) throw new AppError("PAGE_TOO_LARGE", "This page is too large. Try a smaller article.", 413);
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of stream) {
          const buffer = Buffer.from(chunk); size += buffer.length;
          if (size > MAX_HTML_BYTES) throw new AppError("PAGE_TOO_LARGE", "This page is too large. Try a smaller article.", 413);
          chunks.push(buffer);
        }
        resolve({ status, html: Buffer.concat(chunks).toString("utf8") });
      } catch (error) { reject(error); }
      finally { response.removeListener("error", failStream); stream.destroy(); response.destroy(); }
    });
    request.on("error", reject); request.end();
  });
}
export function extractContent(html: string) {
  const $ = load(html);
  const title = $("title").first().text().trim().slice(0, 300) || $("h1").first().text().trim().slice(0, 300) || "Untitled page";
  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg, [hidden], [aria-hidden='true']").remove();
  $("p, div, section, li, h1, h2, h3, h4, h5, h6, br, tr").append(" ");
  const main = $("article, main, [role='main']").toArray()
    .map((element) => $(element).text().replace(/\s+/g, " ").trim())
    .sort((a, b) => b.length - a.length)[0];
  const text = main && main.length >= 100 ? main : $("body").text().replace(/\s+/g, " ").trim();
  if (text.length < 100) throw new AppError("NO_CONTENT", "There is not enough readable text on this page. Try an article that works without JavaScript.", 422);
  return { title, text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS };
}
export async function scrapePage(input: string, dependencies = { resolvePublicAddress, readPage }) {
  const signal = AbortSignal.timeout(10_000);
  let url = validateUrl(input);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const address = await dependencies.resolvePublicAddress(url, signal);
      const page = await dependencies.readPage(url, address, signal);
      if ([301, 302, 303, 307, 308].includes(page.status)) {
        if (!page.location || redirects === 3) throw new AppError("REDIRECT_LIMIT", "This page redirects too many times. Try its final URL.", 422);
        url = validateUrl(new URL(page.location, url).href); continue;
      }
      return { ...extractContent(page.html), sourceUrl: url.href };
    }
    throw new AppError("REDIRECT_LIMIT", "This page redirects too many times.", 422);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal.aborted) throw new AppError("SCRAPE_TIMEOUT", "The page took too long to respond. Try again or use another URL.", 504);
    throw new AppError("PAGE_UNAVAILABLE", "This page could not be read. It may block scraping or require JavaScript. Try another URL.", 502);
  }
}
