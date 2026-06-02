import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Loader2, SendHorizonal, Sparkles } from "lucide-react";
import { AppShell } from "@/components/news/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Citation = { title: string; source: string; url: string | null; published_at: string };
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[] };

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "News Assistant — AXON.INTEL" }] }),
  validateSearch: z.object({ q: z.string().optional() }),
  component: ChatPage,
});

function ChatPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialQ = search.q;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (initialQ && user && messages.length === 0 && !streaming) {
      send(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, user]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    if (!user) {
      toast.error("Sign in to chat with the assistant.");
      return;
    }
    const userMsg: Msg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          conversationId,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        let msg = "Chat failed";
        try { msg = JSON.parse(t).error ?? msg; } catch { msg = t || msg; }
        toast.error(msg);
        setStreaming(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistant: Msg = { role: "assistant", content: "" };
      setMessages((m) => [...m, assistant]);
      let done = false;
      while (!done) {
        const r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "meta") {
              if (parsed.conversationId) setConversationId(parsed.conversationId);
              if (parsed.citations) {
                assistant = { ...assistant, citations: parsed.citations };
                setMessages((m) => m.map((x, i) => (i === m.length - 1 ? assistant : x)));
              }
              continue;
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistant = { ...assistant, content: assistant.content + delta };
              setMessages((m) => m.map((x, i) => (i === m.length - 1 ? assistant : x)));
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stream error");
    } finally {
      setStreaming(false);
    }
  }

  if (loading) return <AppShell title="ASSISTANT"><div className="p-10 grid place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div></AppShell>;
  if (!user) {
    return (
      <AppShell title="ASSISTANT">
        <div className="p-6 space-y-4 text-center">
          <Sparkles className="size-7 mx-auto text-accent" />
          <h2 className="text-base font-semibold text-zinc-100">Conversational News Assistant</h2>
          <p className="text-sm text-zinc-500">Sign in to chat with AXON. Answers are grounded in the latest indexed articles using RAG.</p>
          <Link to="/login" className="inline-block rounded-md bg-accent text-accent-foreground font-semibold text-sm py-2.5 px-6">Sign in</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-zinc-200 flex flex-col">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-hairline">
        <div className="flex h-14 items-center gap-3 px-4 max-w-xl mx-auto">
          <Link to="/" className="text-zinc-400 text-sm">←</Link>
          <div className="size-6 bg-accent rounded-sm grid place-items-center"><div className="size-2.5 bg-surface rounded-full" /></div>
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium tracking-tighter text-zinc-100">AXON.ASSISTANT</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">RAG · grounded in feed</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto max-w-xl mx-auto w-full px-4 py-4 space-y-4 pb-32">
        {messages.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-zinc-500">Ask anything about today's news. Suggestions:</p>
            <div className="flex flex-col gap-2">
              {["Summarize the top tech story today", "What's happening in India this week?", "Explain the latest market move in 3 bullets"].map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left px-4 py-3 bg-panel ring-1 ring-hairline rounded-md text-sm text-zinc-300 hover:ring-accent/50">{s}</button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user"
              ? "bg-accent text-accent-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] text-sm"
              : "bg-panel ring-1 ring-hairline rounded-2xl rounded-tl-sm px-4 py-3 max-w-[95%] text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed"}>
              {m.content || (streaming && i === messages.length - 1 ? <span className="inline-block size-2 bg-accent rounded-full animate-pulse" /> : null)}
              {m.role === "assistant" && m.citations?.length ? (
                <div className="mt-3 pt-3 border-t border-hairline space-y-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Sources</p>
                  {m.citations.map((c, ci) => (
                    <div key={ci} className="text-[11px] text-zinc-400 flex gap-1.5">
                      <span className="font-mono text-accent">[{ci + 1}]</span>
                      <span className="truncate"><span className="text-zinc-300">{c.title}</span> — {c.source}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur border-t border-hairline pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-xl mx-auto px-4 py-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the news assistant…"
            disabled={streaming}
            className="flex-1 bg-panel ring-1 ring-hairline rounded-full px-4 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-accent disabled:opacity-50"
          />
          <button
            disabled={streaming || !input.trim()}
            className="size-10 rounded-full bg-accent text-accent-foreground grid place-items-center disabled:opacity-50"
          >
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
