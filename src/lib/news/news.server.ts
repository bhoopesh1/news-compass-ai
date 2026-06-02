// Server-only helpers for the news intelligence pipeline.
// Implements the agentic RAG pipeline: ingest → classify → summarize → embed → store.

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1";
const CHAT_MODEL = "google/gemini-3-flash-preview";
const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims, fits pgvector HNSW

function apiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

export async function chatComplete(opts: {
  system?: string;
  prompt: string;
  json?: boolean;
  model?: string;
  temperature?: number;
}) {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });
  const res = await fetch(`${LOVABLE_AI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lovable AI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function embed(text: string): Promise<number[]> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!clean) return [];
  const res = await fetch(`${LOVABLE_AI_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: clean }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embeddings ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data?.[0]?.embedding ?? [];
}

export function chunkText(text: string, target = 700, overlap = 80): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= target) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + target);
    // try to cut at sentence boundary
    let cut = end;
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
      if (lastStop > target * 0.5) cut = i + lastStop + 1;
    }
    chunks.push(clean.slice(i, cut).trim());
    i = cut - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter(Boolean);
}

// ---- Classification Agent ----
const VALID_CATEGORIES = ["general", "business", "technology", "science", "health", "sports", "entertainment"];
const VALID_REGIONS = ["global", "in", "us", "gb", "me", "eu", "ap"];
const VALID_LANGUAGES = ["en", "hi", "ta", "es", "fr", "ar"];

export async function classifyArticle(input: { title: string; description?: string | null }) {
  const sys =
    "You are a news classification agent. Return strict JSON with keys: category, region, language, tags, isBreaking. " +
    `category one of ${VALID_CATEGORIES.join(",")}. region one of ${VALID_REGIONS.join(",")}. language ISO-639-1 from ${VALID_LANGUAGES.join(",")}. ` +
    "tags: array of 2-5 short topical keywords (lowercase). isBreaking: boolean true only for urgent/breaking news.";
  const prompt = `Title: ${input.title}\n\n${input.description ?? ""}`;
  try {
    const raw = await chatComplete({ system: sys, prompt, json: true, model: "google/gemini-3-flash-preview" });
    const parsed = JSON.parse(raw);
    return {
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "general",
      region: VALID_REGIONS.includes(parsed.region) ? parsed.region : "global",
      language: VALID_LANGUAGES.includes(parsed.language) ? parsed.language : "en",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      isBreaking: Boolean(parsed.isBreaking),
    };
  } catch (e) {
    console.warn("classify fallback", e);
    return { category: "general", region: "global", language: "en", tags: [], isBreaking: false };
  }
}

// ---- Summarization Agent ----
export async function summarizeArticle(input: { title: string; description?: string | null; content?: string | null }) {
  const body = [input.title, input.description, input.content].filter(Boolean).join("\n\n").slice(0, 6000);
  const sys =
    "You are a news summarization agent. Write a tight 2-3 sentence executive summary (max 60 words) capturing what happened, why it matters, and any notable number or quote. No preamble.";
  try {
    return (await chatComplete({ system: sys, prompt: body, temperature: 0.2 })).trim();
  } catch (e) {
    console.warn("summarize fallback", e);
    return input.description ?? input.title;
  }
}

// ---- News Ingestion Agent ----
export type RawArticle = {
  source: string;
  source_url: string;
  title: string;
  description?: string | null;
  content?: string | null;
  image_url?: string | null;
  author?: string | null;
  published_at: string;
};

export async function fetchFromNewsAPI(opts: { category?: string; country?: string; pageSize?: number }): Promise<RawArticle[]> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    pageSize: String(opts.pageSize ?? 20),
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.country ? { country: opts.country } : {}),
  });
  const res = await fetch(`https://newsapi.org/v2/top-headlines?${params.toString()}`, {
    headers: { "X-Api-Key": key },
  });
  if (!res.ok) {
    console.warn("NewsAPI error", res.status, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  return (data.articles ?? []).map((a: any) => ({
    source: a.source?.name ?? "Unknown",
    source_url: a.url,
    title: a.title,
    description: a.description,
    content: a.content,
    image_url: a.urlToImage,
    author: a.author,
    published_at: a.publishedAt ?? new Date().toISOString(),
  })).filter((a: RawArticle) => a.title && a.source_url);
}

export const SEED_ARTICLES: RawArticle[] = [
  {
    source: "Reuters",
    source_url: "https://example.com/seed/1",
    title: "Maritime strategy shifts as deep-water port operations expand in the Bay of Bengal",
    description:
      "Port expansions in eastern India are projected to increase trade throughput by 22% by 2026, strengthening regional security ties.",
    content:
      "The Indian government announced a $4.2B expansion of deep-water port infrastructure across the Bay of Bengal coastline. Analysts say the move will reshape regional shipping lanes and reduce supply chain bottlenecks tied to Singapore and Colombo. Officials emphasized adherence to zero-carbon shipping protocols by 2030.",
    image_url: null,
    author: "Reuters Staff",
    published_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    source: "Dainik Jagran",
    source_url: "https://example.com/seed/2",
    title: "उत्तर भारत में तकनीकी नवाचार के नए केंद्र का उद्घाटन",
    description: "The new innovation hub in North India is expected to create 50,000 jobs in AI and semiconductor research by 2025.",
    content:
      "Prime Minister inaugurated the country's largest AI and semiconductor research campus in Noida. The facility will host 12 startups, 4 research labs, and a fabrication pilot line. The announcement comes amid a global race to localize chip supply chains.",
    image_url: null,
    author: null,
    published_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  },
  {
    source: "The Hindu",
    source_url: "https://example.com/seed/3",
    title: "Chennai port expansion project receives environmental clearance",
    description: "The expansion will double cargo capacity by 2027 while implementing zero-carbon shipping protocols.",
    content:
      "Tamil Nadu's flagship maritime project cleared the final regulatory hurdle today. The expansion includes new berths, automated cranes, and shore-power facilities to cut emissions from docked vessels.",
    image_url: null,
    author: "Special Correspondent",
    published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    source: "Bloomberg",
    source_url: "https://example.com/seed/4",
    title: "Central Bank pivots on interest rates amid cooling inflation data",
    description:
      "The Reserve Bank signaled a possible rate cut by Q4, citing a 12-month low in core CPI.",
    content:
      "Markets rallied after the central bank governor hinted at a dovish pivot. Bond yields fell across the curve and real estate stocks led the rally. Analysts expect a 25bp cut at the next meeting.",
    image_url: null,
    author: "Bloomberg News",
    published_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    source: "TechCrunch",
    source_url: "https://example.com/seed/5",
    title: "OpenAI launches new on-device model targeting low-power phones",
    description: "The compact model runs entirely on mid-range smartphones without an internet connection.",
    content:
      "The new model, designed for offline inference, brings advanced reasoning to devices with as little as 4GB RAM. Pilot partnerships are underway with three smartphone OEMs in South Asia and Africa.",
    image_url: null,
    author: "Devin Coldewey",
    published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    source: "BBC",
    source_url: "https://example.com/seed/6",
    title: "EU proposes new semiconductor framework to bolster regional supply",
    description: "Brussels unveiled a €15B package to triple wafer capacity by 2030.",
    content:
      "The Chips Act 2.0 includes production subsidies, R&D grants, and skilled-migration fast-tracks. Industry groups cautiously welcomed the move but warned about scaling talent quickly.",
    image_url: null,
    author: "BBC Brussels",
    published_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
];
