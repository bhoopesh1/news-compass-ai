import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  chunkText,
  classifyArticle,
  embed,
  fetchFromNewsAPI,
  SEED_ARTICLES,
  summarizeArticle,
  type RawArticle,
} from "./news.server";

const FilterSchema = z.object({
  region: z.string().optional(),
  language: z.string().optional(),
  category: z.string().optional(),
  timeRange: z.string().optional(),
  limit: z.number().min(1).max(50).optional().default(20),
});

export const listArticles = createServerFn({ method: "POST" })
  .inputValidator((input) => FilterSchema.parse(input))
  .handler(async ({ data }) => {
    let query = supabaseAdmin
      .from("articles")
      .select("id, source, source_url, title, description, ai_summary, category, region, language, tags, image_url, author, is_breaking, published_at")
      .order("published_at", { ascending: false })
      .limit(data.limit);

    if (data.region && data.region !== "all") query = query.eq("region", data.region);
    if (data.language && data.language !== "all") query = query.eq("language", data.language);
    if (data.category && data.category !== "all") query = query.eq("category", data.category);

    if (data.timeRange && data.timeRange !== "all") {
      const hours: Record<string, number> = { "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
      const h = hours[data.timeRange];
      if (h) {
        const since = new Date(Date.now() - h * 3600 * 1000).toISOString();
        query = query.gte("published_at", since);
      }
    }
    const { data: rows, error } = await query;
    if (error) {
      console.error("listArticles", error);
      return { articles: [], error: error.message };
    }
    return { articles: rows ?? [], error: null };
  });

export const getArticle = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: article, error } = await supabaseAdmin
      .from("articles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !article) return { article: null, error: error?.message ?? "Not found" };
    return { article, error: null };
  });

export const getAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("alerts")
    .select("id, headline, region, language, category, severity, created_at, article_id")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { alerts: [], error: error.message };
  return { alerts: data ?? [], error: null };
});

export const semanticSearch = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      query: z.string().min(2).max(500),
      region: z.string().optional(),
      language: z.string().optional(),
      category: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const vec = await embed(data.query);
      if (!vec.length) return { results: [], error: "Empty embedding" };
      const { data: rows, error } = await supabaseAdmin.rpc("match_article_chunks", {
        query_embedding: vec as unknown as string,
        match_count: 8,
        region_filter: data.region && data.region !== "all" ? data.region : null,
        language_filter: data.language && data.language !== "all" ? data.language : null,
        category_filter: data.category && data.category !== "all" ? data.category : null,
      });
      if (error) {
        console.error("semanticSearch rpc", error);
        return { results: [], error: error.message };
      }
      const seen = new Map<string, any>();
      for (const row of rows ?? []) {
        const existing = seen.get(row.article_id);
        if (!existing || row.similarity > existing.similarity) seen.set(row.article_id, row);
      }
      return { results: Array.from(seen.values()), error: null };
    } catch (e) {
      console.error(e);
      return { results: [], error: e instanceof Error ? e.message : "Search failed" };
    }
  });

export const getPersonalizedFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ limit: z.number().min(1).max(50).optional().default(20) }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prefs } = await supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
    let q = supabaseAdmin
      .from("articles")
      .select("id, source, source_url, title, description, ai_summary, category, region, language, tags, image_url, author, is_breaking, published_at")
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (prefs?.regions?.length) q = q.in("region", prefs.regions);
    if (prefs?.languages?.length) q = q.in("language", prefs.languages);
    if (prefs?.categories?.length) q = q.in("category", prefs.categories);
    const { data: rows } = await q;
    return { articles: rows ?? [] };
  });

export const getPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
    return { preferences: data };
  });

const PrefsInput = z.object({
  regions: z.array(z.string()).min(1).max(10),
  languages: z.array(z.string()).min(1).max(10),
  categories: z.array(z.string()).min(1).max(10),
  alerts_enabled: z.boolean(),
});

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => PrefsInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: userId, ...data, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const ingestNews = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ useSeed: z.boolean().optional() }).parse(i))
  .handler(async ({ data }) => {
    let raw: RawArticle[] = [];
    if (!data.useSeed && process.env.NEWSAPI_KEY) {
      const countries = ["us", "in", "gb"];
      const categories = ["general", "technology", "business"];
      for (const c of countries) {
        for (const cat of categories) {
          raw = raw.concat(await fetchFromNewsAPI({ country: c, category: cat, pageSize: 5 }));
        }
      }
    }
    if (raw.length === 0) raw = SEED_ARTICLES;

    let inserted = 0;
    let skipped = 0;
    for (const a of raw) {
      const { data: existing } = await supabaseAdmin
        .from("articles")
        .select("id")
        .eq("source_url", a.source_url)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      try {
        const [cls, summary] = await Promise.all([
          classifyArticle({ title: a.title, description: a.description }),
          summarizeArticle({ title: a.title, description: a.description, content: a.content }),
        ]);
        const embeddingText = `${a.title}\n${summary}`;
        const vec = await embed(embeddingText);
        const { data: row, error: insErr } = await supabaseAdmin
          .from("articles")
          .insert({
            source: a.source,
            source_url: a.source_url,
            title: a.title,
            description: a.description,
            content: a.content,
            ai_summary: summary,
            category: cls.category,
            region: cls.region,
            language: cls.language,
            tags: cls.tags,
            image_url: a.image_url,
            author: a.author,
            is_breaking: cls.isBreaking,
            published_at: a.published_at,
            embedding: vec as unknown as any,
          })
          .select("id")
          .single();
        if (insErr || !row) {
          console.warn("insert article failed", insErr);
          continue;
        }
        const chunks = chunkText([a.title, summary, a.content ?? a.description ?? ""].filter(Boolean).join("\n\n"));
        for (let i = 0; i < chunks.length; i++) {
          const cVec = await embed(chunks[i]);
          await supabaseAdmin.from("article_chunks").insert({
            article_id: row.id,
            chunk_index: i,
            content: chunks[i],
            embedding: cVec as unknown as any,
          });
        }
        if (cls.isBreaking) {
          await supabaseAdmin.from("alerts").insert({
            article_id: row.id,
            headline: a.title,
            region: cls.region,
            language: cls.language,
            category: cls.category,
            severity: "breaking",
          });
        }
        inserted++;
      } catch (e) {
        console.warn("process article failed", e);
      }
    }
    return { inserted, skipped, total: raw.length };
  });
