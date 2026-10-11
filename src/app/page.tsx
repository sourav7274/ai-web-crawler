import Link from "next/link";
import Summarizer from "@/components/summarizer";
/* THESIS: A focused reading desk: submit a source, then read its distilled ideas.
 * OWN-WORLD: Cool white paper, graphite text, cobalt actions; system typography.
 * STORY: Paste a public webpage and get a sourced overview with key points.
 * FIRST VIEWPORT: Small masthead, generous heading, full-width form, reading area.
 * FORM: User-selected vertical reading flow; controls precede the readable result.
 */
export default function Home() {
  return <div className="page-shell">
    <header className="masthead">
      <Link className="wordmark" href="/" aria-label="PageBrief home"><span className="brand-mark" aria-hidden="true">pb.</span>PageBrief</Link>
      <span className="powered"><span aria-hidden="true">✦</span> Powered by Gemini</span>
    </header>
    <main id="main">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Less reading. More understanding.</p>
        <h1 id="page-title">A whole page.<br /><span>The essential ideas.</span></h1>
        <p className="intro-copy">Turn a webpage into a clear overview and a few key points.<br className="desktop-break" /> Just bring the link. We’ll do the reading.</p>
      </section>
      <Summarizer />
    </main>
    <footer><span>A little less scrolling, a little more clarity.</span><span>Public HTML pages · AI summaries can make mistakes</span></footer>
  </div>;
}
