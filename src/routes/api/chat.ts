import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed } from "@/lib/news/news.server";
import {
  withSecurity,
  ValidationSchemas,
  API_RATE_LIMIT,
  extractBearerToken,
  sanitizeError,
} from "@/lib/security";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * Authenticated chat API endpoint
 * Rate limited: 30 requests per minute per user
 * Requires Supabase authentication token
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return withSecurity(
          request,
          async (req) => {
            try {
              // Extract and validate token
              const authHeader = req.headers.get("authorization");
              const token = extractBearerToken(authHeader);
              if (!token) {
                return new Response(
                  JSON.stringify({ error: "Unauthorized: Missing authentication token" }),
                  { status: 401, headers: { "Content-Type": "application/json" } }
                );
              }

              // Verify user
              const userClient = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_PUBLISHABLE_KEY!,
                { global: { headers: { Authorization: `Bearer ${token}` } } }
              );
              const { data: userData, error: userErr } = await userClient.auth.getUser();
              if (userErr || !userData.user) {
                return new Response(
                  JSON.stringify({ error: "Unauthorized: Invalid token" }),
                  { status: 401, headers: { "Content-Type": "application/json" } }
                );
              }
              const userId = userData.user.id;

              // Parse and validate input
              let body: unknown;
              try {
                body = await req.json();
              } catch {
                return new Response(
                  JSON.stringify({ error: "Invalid JSON payload" }),
                  { status: 400, headers: { "Content-Type": "application/json" } }
                );
              }

              const validated = ValidationSchemas.chatPayload.parse(body);
              const messages = validated.messages ?? [];
              const lastUser = [...messages].reverse().find((m) => m.role === "user");

              if (!lastUser) {
                return new Response(
                  JSON.stringify({ error: "No user message provided" }),
                  { status: 400, headers: { "Content-Type": "application/json" } }
                );
              }

              // Ensure conversation
              let conversationId = validated.conversationId ?? null;
              if (!conversationId) {
                const title = lastUser.content.slice(0, 60);
                const { data: conv } = await supabaseAdmin
                  .from("conversations")
                  .insert({ user_id: userId, title })
                  .select("id")
                  .single();
                conversationId = conv?.id ?? null;
              }

              if (conversationId) {
                await supabaseAdmin.from("messages").insert({
                  conversation_id: conversationId,
                  role: "user",
                  content: lastUser.content,
                });
              }

              // RAG retrieval
              let context = "No relevant articles indexed yet.";
              let citations: Array<{ title: string; source: string; url: string | null; published_at: string }> = [];
              try {
                const vec = await embed(lastUser.content);
                if (vec.length) {
                  const { data: rows } = await supabaseAdmin.rpc("match_article_chunks", {
                    query_embedding: vec as unknown as string,
                    match_count: 6,
                    region_filter:
                      validated.filters?.region && validated.filters.region !== "all"
                        ? validated.filters.region
                        : undefined,
                    language_filter:
                      validated.filters?.language && validated.filters.language !== "all"
                        ? validated.filters.language
                        : undefined,
                    category_filter:
                      validated.filters?.category && validated.filters.category !== "all"
                        ? validated.filters.category
                        : undefined,
                  });
                  if (rows && rows.length) {
                    const seen = new Map<string, any>();
                    for (const r of rows) {
                      if (!seen.has(r.article_id) || seen.get(r.article_id).similarity < r.similarity) {
                        seen.set(r.article_id, r);
                      }
                    }
                    const unique = Array.from(seen.values()).slice(0, 5);
                    context = unique
                      .map(
                        (r, i) =>
                          `[${i + 1}] ${r.title} — ${r.source} (${new Date(r.published_at).toLocaleString()})\n${r.content}`
                      )
                      .join("\n\n---\n\n");
                    citations = unique.map((r) => ({
                      title: r.title,
                      source: r.source,
                      url: r.source_url,
                      published_at: r.published_at,
                    }));
                  }
                }
              } catch (e) {
                console.warn("rag failed", e);
              }

              const systemPrompt = `You are AXON, an AI news assistant. Use ONLY the retrieved articles below to answer. Cite sources inline as [1], [2] matching the numbering. If the answer is not in the articles, say so and suggest a related angle. Be concise (under 180 words).\n\nRETRIEVED ARTICLES:\n${context}`;

              const upstream = await fetch(LOVABLE_AI_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-3-flash-preview",
                  stream: true,
                  messages: [{ role: "system", content: systemPrompt }, ...messages],
                }),
              });

              if (!upstream.ok || !upstream.body) {
                if (upstream.status === 429) {
                  return new Response(
                    JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
                    { status: 429, headers: { "Content-Type": "application/json" } }
                  );
                }
                if (upstream.status === 402) {
                  return new Response(
                    JSON.stringify({ error: "AI service quota exceeded" }),
                    { status: 402, headers: { "Content-Type": "application/json" } }
                  );
                }
                const errText = await upstream.text();
                console.error("ai gateway error", upstream.status, errText);
                return new Response(
                  JSON.stringify({
                    error: "AI gateway error",
                    ...(process.env.NODE_ENV === "development" && { details: errText.slice(0, 100) }),
                  }),
                  { status: 500, headers: { "Content-Type": "application/json" } }
                );
              }

              // Tee stream: forward to client AND collect full response to persist
              const encoder = new TextEncoder();
              const decoder = new TextDecoder();
              let fullText = "";

              const transformed = new ReadableStream({
                async start(controller) {
                  // First, send citations as a custom event
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "meta", citations, conversationId })}\n\n`)
                  );
                  const reader = upstream.body!.getReader();
                  let buf = "";
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buf += decoder.decode(value, { stream: true });
                      let nl;
                      while ((nl = buf.indexOf("\n")) !== -1) {
                        let line = buf.slice(0, nl);
                        buf = buf.slice(nl + 1);
                        if (line.endsWith("\r")) line = line.slice(0, -1);
                        if (!line.startsWith("data: ")) {
                          if (line) controller.enqueue(encoder.encode(line + "\n"));
                          continue;
                        }
                        const json = line.slice(6).trim();
                        if (json === "[DONE]") {
                          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                          continue;
                        }
                        try {
                          const parsed = JSON.parse(json);
                          const delta = parsed.choices?.[0]?.delta?.content;
                          if (delta) fullText += delta;
                        } catch {}
                        controller.enqueue(encoder.encode(line + "\n"));
                      }
                    }
                    if (conversationId && fullText) {
                      await supabaseAdmin.from("messages").insert({
                        conversation_id: conversationId,
                        role: "assistant",
                        content: fullText,
                        citations: citations as unknown as any,
                      });
                      await supabaseAdmin
                        .from("conversations")
                        .update({ updated_at: new Date().toISOString() })
                        .eq("id", conversationId);
                    }
                  } catch (e) {
                    console.error("stream error", e);
                  } finally {
                    controller.close();
                  }
                },
              });

              return new Response(transformed, {
                status: 200,
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            } catch (error) {
              if (error instanceof Error && error.message.includes("validation")) {
                return new Response(
                  JSON.stringify({ error: "Invalid request format" }),
                  { status: 400, headers: { "Content-Type": "application/json" } }
                );
              }

              console.error("Chat endpoint error:", error);
              return new Response(
                JSON.stringify({
                  error: "Chat processing failed",
                  ...(process.env.NODE_ENV === "development" && {
                    details: sanitizeError(error),
                  }),
                }),
                { status: 500, headers: { "Content-Type": "application/json" } }
              );
            }
          },
          {
            rateLimit: API_RATE_LIMIT,
          }
        );
      },
    },
  },
});
