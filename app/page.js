"use client";

import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  { label: "Wikipedia: Coffee", url: "https://en.wikipedia.org/wiki/Coffee" },
  { label: "Paul Graham: How to Do Great Work", url: "https://paulgraham.com/greatwork.html" },
];

const STEPS = ["Opening the page", "Extracting the readable text", "Writing the summary"];

function LinkIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5 22 20H2L12 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 9.5v5M12 17.5v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const loading = status === "loading";

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const timers = [setTimeout(() => setStep(1), 1400), setTimeout(() => setStep(2), 3000)];
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  async function summarize(target) {
    const value = (target ?? url).trim();
    if (!value) {
      setStatus("error");
      setError("Paste a link in the field above first.");
      inputRef.current?.focus();
      return;
    }

    setUrl(value);
    setStatus("loading");
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}.`);
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err.message || "Couldn't reach the server. Check your connection.");
      setStatus("error");
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!loading) summarize();
  }

  async function copySummary() {
    if (!result) return;
    const text = [result.title, "", result.tldr, "", ...result.points.map((p) => `- ${p}`), "", result.url].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function reset() {
    setUrl("");
    setResult(null);
    setStatus("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
    inputRef.current?.focus();
  }

  const minutes = result ? Math.max(1, Math.round(result.wordCount / 230)) : 0;

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            AI Web Scraper
          </div>
        </div>
      </header>

      <main className="page">
        <section className="intro">
          <h1>Summarize any web page in seconds</h1>
          <p>
            Paste a link to an article, blog post or docs page. AI Web Scraper reads the page and
            tells you what it&rsquo;s about and which points matter.
          </p>
        </section>

        <form className="card form-card" onSubmit={handleSubmit} noValidate>
          <label className="field__label" htmlFor="url">
            Page URL
          </label>
          <div className="field__row">
            <div className="field__control">
              <LinkIcon className="field__icon" />
              <input
                ref={inputRef}
                id="url"
                className="field__input"
                type="url"
                inputMode="url"
                autoComplete="url"
                spellCheck="false"
                placeholder="https://example.com/some-article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                aria-describedby="url-help"
              />
            </div>
            <button className="btn btn--primary btn--lg" type="submit" disabled={loading}>
              {loading && <span className="btn__spinner" aria-hidden="true" />}
              {loading ? "Summarizing…" : "Summarize"}
            </button>
          </div>
          <p className="field__helper" id="url-help">
            Works best on articles and static pages. You can leave out the https://.
          </p>

          <div className="examples">
            <span>Try an example:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.url}
                type="button"
                className="btn btn--tertiary"
                disabled={loading}
                onClick={() => summarize(ex.url)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </form>

        <div className="state" aria-live="polite">
          {loading && (
            <div className="card" role="status">
              <div className="loading__head">
                <span className="spinner" aria-hidden="true" />
                <div>
                  <div className="loading__title">Loading…</div>
                  <div className="loading__step">{STEPS[step]}</div>
                </div>
              </div>
              <div className="progress" aria-hidden="true">
                <div className="progress__bar" />
              </div>
              <div className="skeleton" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="alert alert--error" role="alert">
              <span className="alert__icon" aria-hidden="true">
                <ErrorIcon />
              </span>
              <div>
                <div className="alert__title">Couldn&rsquo;t summarize that page</div>
                <div className="alert__body">{error}</div>
              </div>
            </div>
          )}

          {status === "done" && result && (
            <article className="card">
              <div className="result__meta">
                <span className="badge badge--purple">{result.host}</span>
                <span className="badge badge--gray">{result.wordCount.toLocaleString()} words</span>
                <span className="badge badge--gray">{minutes} min read in full</span>
              </div>

              <h2 className="result__title">{result.title}</h2>
              <p className="result__tldr">{result.tldr}</p>

              {result.points.length > 0 && (
                <div className="result__section">
                  <h3 className="result__heading">Key points</h3>
                  <ul className="points">
                    {result.points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.truncated && (
                <p className="result__note">
                  This page is long, so the summary covers roughly its first 15,000 characters.
                </p>
              )}

              <div className="result__actions">
                <button type="button" className="btn btn--secondary btn--md" onClick={copySummary}>
                  {copied ? "Copied" : "Copy summary"}
                </button>
                <a className="btn btn--tertiary btn--md" href={result.url} target="_blank" rel="noreferrer">
                  Open original page
                </a>
                <button type="button" className="btn btn--tertiary btn--md" onClick={reset}>
                  Summarize another page
                </button>
              </div>
            </article>
          )}
        </div>

        <footer className="footer">
          Sites that load their text with JavaScript or block automated visitors may not return a
          summary.
        </footer>
      </main>
    </>
  );
}