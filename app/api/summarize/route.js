import { NextResponse } from "next/server";
import { scrapePage } from "@/lib/scrape";
import { summarize } from "@/lib/summarize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send JSON like { "url": "https://..." }.' }, { status: 400 });
  }

  try {
    const page = await scrapePage(body?.url);
    const summary = await summarize(page);

    return NextResponse.json({
      url: page.url,
      host: page.host,
      title: page.title,
      wordCount: page.wordCount,
      truncated: page.truncated,
      tldr: summary.tldr,
      points: summary.points,
      model: summary.model,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[summarize]", err);
    return NextResponse.json(
      { error: err.status ? err.message : "Something broke on the server. Try again." },
      { status }
    );
  }
}

export function GET() {
  return NextResponse.json({ ok: true, usage: "POST { url } to this endpoint." });
}
