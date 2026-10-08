export class AIError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function buildPrompt(page) {
  return `Summarize the web page below for someone deciding whether it's worth their time.

Reply with JSON only, exactly this shape:
{"tldr": string, "points": string[]}

Rules:
- "tldr": 2 or 3 plain sentences covering what the page is about and its main takeaway.
- "points": 3 to 5 key points, one sentence each. Be specific: keep names, numbers, dates and conclusions. No vague filler.
- Write in the same language as the page.
- Don't start sentences with "This page", "The article" or "The author" over and over.
- Ignore leftover navigation, cookie notices and ads if any slipped into the text.

Page title: ${page.title}
Page URL: ${page.url}

Page text:
"""
${page.text}
"""`;
}

function pickProvider() {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  if (forced === "gemini" || forced === "groq") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  return null;
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("GEMINI_API_KEY is missing on the server. Add it to .env.local.", 500);
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw providerError("Gemini", res.status, data?.error?.message);

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new AIError("Gemini returned an empty response. Try again.");
  return { raw: text, model };
}

const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
const GROQ_PREFERRED = [
  /gpt-oss-120b/i,
  /llama-4-maverick/i,
  /llama-4-scout/i,
  /gpt-oss-20b/i,
  /llama-3\.3-70b/i,
  /qwen/i,
  /llama-3\.1-8b/i,
];
const GROQ_NOT_CHAT = /whisper|guard|tts|playai|orpheus|distil|compound|allam|embed/i;
let groqWorkingModel = null;

function groqRequest(key, model, prompt) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });
}

function isModelUnavailable(status, data) {
  const code = data?.error?.code || "";
  const msg = data?.error?.message || "";
  return (
    status === 404 ||
    code === "model_not_found" ||
    code === "model_decommissioned" ||
    /does not exist|decommissioned|no longer supported|not found/i.test(msg)
  );
}

async function findGroqModel(key, exclude) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = (data.data || [])
      .filter((m) => m.active !== false && !GROQ_NOT_CHAT.test(m.id) && m.id !== exclude)
      .map((m) => m.id);
    for (const pattern of GROQ_PREFERRED) {
      const hit = ids.find((id) => pattern.test(id));
      if (hit) return hit;
    }
    return ids[0] || null;
  } catch {
    return null;
  }
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new AIError("GROQ_API_KEY is missing on the server. Add it to .env.local.", 500);

  let model = groqWorkingModel || process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  let res = await groqRequest(key, model, prompt);
  let data = await res.json().catch(() => ({}));

  if (!res.ok && isModelUnavailable(res.status, data)) {
    const replacement = await findGroqModel(key, model);
    if (replacement) {
      console.warn(
        `[summarize] Groq model "${model}" is unavailable, using "${replacement}" instead. ` +
          `Set GROQ_MODEL=${replacement} in your env file to skip this lookup.`
      );
      model = replacement;
      res = await groqRequest(key, model, prompt);
      data = await res.json().catch(() => ({}));
    }
  }

  if (!res.ok) throw providerError("Groq", res.status, data?.error?.message);
  groqWorkingModel = model;

  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new AIError("Groq returned an empty response. Try again.");
  return { raw: text, model };
}

function providerError(name, status, detail) {
  if (status === 429) {
    return new AIError(`${name} rate limit reached. Wait a minute and try again.`, 429);
  }
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(detail || ""))) {
    return new AIError(`${name} rejected the API key. Check the key in .env.local.`, 500);
  }
  return new AIError(`${name} couldn't summarize this page${detail ? `: ${detail}` : "."}`, 502);
}

function parseSummary(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  const candidate = first !== -1 && last > first ? cleaned.slice(first, last + 1) : cleaned;
  try {
    const obj = JSON.parse(candidate);
    const tldr = String(obj.tldr || "").trim();
    const points = Array.isArray(obj.points)
      ? obj.points.map((p) => String(p).trim()).filter(Boolean).slice(0, 6)
      : [];
    if (tldr) return { tldr, points };
  } catch {
    return { tldr: cleaned, points: [] };
  }
  return { tldr: cleaned, points: [] };
}

export async function summarize(page) {
  const provider = pickProvider();
  if (!provider) {
    throw new AIError(
      "No AI key found on the server. Add GEMINI_API_KEY or GROQ_API_KEY to .env.local and restart.",
      500
    );
  }
  const prompt = buildPrompt(page);
  const { raw, model } = provider === "groq" ? await callGroq(prompt) : await callGemini(prompt);
  return { ...parseSummary(raw), provider, model };
}
