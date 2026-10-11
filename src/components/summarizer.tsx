"use client";
import { useRef, useState } from "react";
import { resultSchema, type SummaryResult } from "@/lib/contracts";

function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export default function Summarizer() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const busy = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setLoading(true); setError(""); setResult(null); setCopyStatus("");
    try {
      const response = await fetch("/api/summarize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }), signal: AbortSignal.timeout(50_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "The page could not be summarized. Please try again.");
      const parsed = resultSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The summary was incomplete. Please try again.");
      setResult(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "TimeoutError" ? "This is taking longer than expected. Please try again." : cause instanceof Error && cause.name !== "TypeError" ? cause.message : "Could not connect. Check your connection and try again.");
    } finally { busy.current = false; setLoading(false); }
  }
  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.title + "\n" + result.sourceUrl + "\n\n" + result.overview + "\n\nKey points\n" + result.keyPoints.map((point) => "• " + point).join("\n"));
      setCopyStatus("Copied to clipboard");
    } catch { setCopyStatus("Copy is unavailable. Select the summary text to copy it."); }
  }
  return <>
    <form className="url-form" onSubmit={submit}>
      <label htmlFor="page-url">Webpage URL</label>
      <div className="input-row">
        <svg className="link-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0m2 1 1-1a4.2 4.2 0 0 1 6 6l-4 4a4.2 4.2 0 0 1-6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        <input id="page-url" type="url" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/an-interesting-article" autoComplete="url" spellCheck={false} disabled={loading} aria-describedby="url-help" />
        <button className="submit-button" type="submit" disabled={loading || !url.trim()}>{loading ? "Summarizing…" : "Summarize"}{loading ? <span className="spinner" aria-hidden="true" /> : <Arrow />}</button>
      </div>
      <p id="url-help" className="helper">Best with articles, blog posts, and other text-rich pages. No sign-in required.</p>
    </form>
    <section className="reading-area" aria-label="Page summary" aria-busy={loading}>
      <div className="section-heading"><h2>Your brief</h2><span>{loading ? "In progress" : result ? "Ready to read" : "Ready when you are"}</span></div>
      {loading && <div className="loading-state" role="status"><span className="loading-symbol" aria-hidden="true">✦</span><h3>Reading between the lines.</h3><p>Loading… fetching the page and finding its essential ideas.</p><div className="loading-track" aria-hidden="true" /></div>}
      {error && <div className="error-state" role="alert"><h3>We couldn’t make this brief.</h3><p>{error}</p><p className="error-hint">You can edit the link above and try again.</p></div>}
      {result && <article className="summary-result">
        <div className="result-top"><a className="source-link" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(result.sourceUrl).hostname}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a><button className="copy-button" onClick={copy}>Copy brief <span aria-hidden="true">⧉</span></button></div>
        <h3 className="result-title">{result.title}</h3>
        <p className="overview">{result.overview}</p>
        <h4>Key points</h4><ul className="key-points">{result.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
        {result.truncated && <p className="truncation-note">This is a long page. This brief covers the first 30,000 characters of extracted text.</p>}
        <p className="copy-status" role="status">{copyStatus}</p>
      </article>}
      {!loading && !error && !result && <div className="empty-state"><span className="empty-symbol" aria-hidden="true">↳</span><div><h3>The interesting part, without the long part.</h3><p>Paste a link above. Your overview and key points will appear here.</p></div></div>}
      <span className="sr-only" role="status">{result ? "Your summary is ready." : ""}</span>
    </section>
  </>;
}
