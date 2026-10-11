import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { gzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);
import { extractContent, isPublicAddress, MAX_HTML_BYTES, MAX_TEXT_CHARS, readPage, resolvePublicAddress, scrapePage, validateUrl } from "../src/lib/server/scraper";

const prose = "A useful article explains how the web works. HTML gives content structure, CSS controls presentation, and JavaScript adds interactive behavior. ".repeat(3);
const html = "<title>The web</title><nav>Unwanted menu</nav><article><p>" + prose + "</p><script>evil()</script><p>Final paragraph.</p></article><footer>Unwanted footer</footer>";
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
describe("URL and address validation", () => {
  it.each(["file:///etc/passwd", "ftp://example.com", "http://localhost", "http://localhost.", "http://test.local", "http://127.1", "http://2130706433", "http://0x7f000001", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://169.254.169.254", "https://user:password@example.com", "http://example.com:3000"])("blocks %s", (url) => expect(() => validateUrl(url)).toThrow());
  it("keeps public HTTPS URLs and strips fragments", () => expect(validateUrl("https://example.com/story#part").href).toBe("https://example.com/story"));
  it.each(["10.1.2.3", "172.16.0.1", "192.168.1.1", "0.0.0.0", "100.64.0.1", "192.0.2.1", "224.0.0.1", "::", "fc00::1", "fe80::1", "2001:db8::1", "::ffff:10.0.0.1"])("blocks non-public %s", (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public %s", (address) => expect(isPublicAddress(address)).toBe(true));
  it("blocks domains with any private DNS answer", async () => {
    dns.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(resolvePublicAddress(new URL("https://example.com"), AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "UNSAFE_URL" });
  });
  it("bounds DNS resolution by the scrape deadline", async () => {
    dns.lookup.mockReturnValue(new Promise(() => {}));
    await expect(resolvePublicAddress(new URL("https://example.com"), AbortSignal.timeout(20))).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
describe("main text extraction", () => {
  it("extracts title and article without boilerplate or scripts", () => {
    const page = extractContent(html);
    expect(page.title).toBe("The web");
    expect(page.text).toContain("Final paragraph.");
    expect(page.text).not.toMatch(/Unwanted|evil/);
  });
  it("falls back to body and preserves paragraph word boundaries", () => {
    expect(extractContent("<p>" + prose + "</p><p>Second paragraph</p>").text).toContain("behavior. Second paragraph");
  });
  it("rejects empty and JavaScript-only pages", () => expect(() => extractContent("<script>app()</script>")).toThrow());
  it("caps long text and discloses truncation", () => {
    const page = extractContent("<main>" + "Readable content. ".repeat(3000) + "</main>");
    expect(page.text).toHaveLength(MAX_TEXT_CHARS); expect(page.truncated).toBe(true);
  });
});
describe("redirect handling", () => {
  const address = { address: "1.1.1.1", family: 4 };
  it("revalidates redirect URLs before connecting", async () => {
    const read = vi.fn().mockResolvedValue({ status: 302, location: "http://127.0.0.1", html: "" });
    await expect(scrapePage("https://example.com", { resolvePublicAddress: vi.fn().mockResolvedValue(address), readPage: read })).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("resolves and checks DNS again on a redirected host", async () => {
    const resolver = vi.fn().mockResolvedValueOnce(address).mockRejectedValueOnce(new Error("DNS failure"));
    const read = vi.fn().mockResolvedValue({ status: 302, location: "https://other.example/story", html: "" });
    await expect(scrapePage("https://example.com", { resolvePublicAddress: resolver, readPage: read })).rejects.toMatchObject({ code: "PAGE_UNAVAILABLE" });
    expect(resolver).toHaveBeenCalledTimes(2); expect(read).toHaveBeenCalledTimes(1);
  });
  it("supports relative redirects and returns the final URL", async () => {
    const read = vi.fn().mockResolvedValueOnce({ status: 302, location: "/story", html: "" }).mockResolvedValueOnce({ status: 200, html });
    const page = await scrapePage("https://example.com", { resolvePublicAddress: vi.fn().mockResolvedValue(address), readPage: read });
    expect(page.sourceUrl).toBe("https://example.com/story");
  });
  it("stops redirect loops", async () => {
    const read = vi.fn().mockResolvedValue({ status: 302, location: "/loop", html: "" });
    await expect(scrapePage("https://example.com", { resolvePublicAddress: vi.fn().mockResolvedValue(address), readPage: read })).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
    expect(read).toHaveBeenCalledTimes(4);
  });
});
describe("pinned HTTP transport", () => {
  async function serve(handler: http.RequestListener, action: (url: URL) => Promise<void>) {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try { await action(new URL("http://public.example:" + port + "/article")); }
    finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
  const address = { address: "127.0.0.1", family: 4 };
  it("connects to the provided IP, preserves Host, and decodes gzip", async () => {
    await serve((req, res) => {
      expect(req.headers.host).toMatch(/^public.example:/);
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync(html));
    }, async (url) => expect((await readPage(url, address, AbortSignal.timeout(1000))).html).toBe(html));
  });
  it("rejects non-HTML", async () => {
    await serve((_req, res) => { res.writeHead(200, { "content-type": "application/pdf" }); res.end("PDF"); },
      async (url) => { await expect(readPage(url, address, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "NOT_HTML" }); });
  });
  it("caps decompressed bytes, including compressed oversized pages", async () => {
    await serve((_req, res) => { res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); res.end(gzipSync("a".repeat(MAX_HTML_BYTES + 1))); },
      async (url) => { await expect(readPage(url, address, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "PAGE_TOO_LARGE" }); });
  });
  it("aborts slow requests", async () => {
    await serve(() => {}, async (url) => { await expect(readPage(url, address, AbortSignal.timeout(20))).rejects.toMatchObject({ name: "AbortError" }); });
  });
});
