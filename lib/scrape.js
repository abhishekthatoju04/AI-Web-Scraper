import * as cheerio from "cheerio";

const MAX_CHARS = 15000;
const TIMEOUT_MS = 12000;

export class ScrapeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1") {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function normalizeUrl(input) {
  let value = String(input || "").trim();
  if (!value) throw new ScrapeError("Paste a link to summarize.");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ScrapeError("That link isn't a valid web address.");
  }
  if (isPrivateHost(url.hostname)) {
    throw new ScrapeError("Only public web pages can be summarized.");
  }
  if (!url.hostname.includes(".")) {
    throw new ScrapeError("That link isn't a valid web address.");
  }
  return url;
}

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

export async function scrapePage(rawUrl) {
  const url = normalizeUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ScrapeError("The page took too long to respond. Try again or use another link.", 504);
    }
    throw new ScrapeError("Couldn't reach that page. Check the link and try again.", 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ScrapeError(
      `The site answered with error ${res.status}. It may block automated visitors.`,
      502
    );
  }

  const type = res.headers.get("content-type") || "";
  if (!type.includes("html")) {
    throw new ScrapeError("That link points to a file, not a web page. Paste a link to an HTML page.", 415);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title =
    clean($('meta[property="og:title"]').attr("content")) ||
    clean($("title").first().text()) ||
    clean($("h1").first().text()) ||
    url.hostname;

  $(
    [
      "script", "style", "noscript", "template", "svg", "canvas", "iframe",
      "form", "button", "input", "select", "nav", "header", "footer", "aside",
      "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[aria-hidden=true]",
      ".cookie", ".cookies", ".advert", ".ads", ".newsletter", ".share", ".social",
    ].join(",")
  ).remove();

  const candidates = [
    "article", "main", "[role=main]", "#content", "#main",
    ".post-content", ".entry-content", ".article-body", ".content",
  ];
  let root = null;
  for (const selector of candidates) {
    const el = $(selector).first();
    if (el.length && clean(el.text()).length > 400) {
      root = el;
      break;
    }
  }
  if (!root) root = $("body");

  const seen = new Set();
  const blocks = [];
  root.find("h1, h2, h3, h4, p, li, blockquote, pre, figcaption, td").each((_, el) => {
    const text = clean($(el).text());
    if (text.length < 2 || seen.has(text)) return;
    seen.add(text);
    blocks.push(text);
  });

  let text = blocks.join("\n");
  if (text.length < 200) text = clean(root.text());

  if (text.length < 100) {
    throw new ScrapeError(
      "There's almost no readable text on that page. It probably loads its content with JavaScript.",
      422
    );
  }

  const finalUrl = res.url || url.href;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    url: finalUrl,
    host: new URL(finalUrl).hostname.replace(/^www\./, ""),
    title,
    text: text.slice(0, MAX_CHARS),
    wordCount,
    truncated: text.length > MAX_CHARS,
  };
}
