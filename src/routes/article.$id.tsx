import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { getArticle } from "@/lib/news/news.functions";
import { AppShell } from "@/components/news/AppShell";
import { LANGUAGES, REGIONS } from "@/lib/news/constants";

export const Route = createFileRoute("/article/$id")({
  head: () => ({ meta: [{ title: "Article — AXON.INTEL" }] }),
  component: ArticlePage,
});

function ArticlePage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getArticle);
  const q = useQuery({ queryKey: ["article", id], queryFn: () => fn({ data: { id } }) });
  const article = q.data?.article;

  if (q.isLoading) {
    return <AppShell><div className="p-12 grid place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div></AppShell>;
  }
  if (!article) {
    return (
      <AppShell>
        <div className="p-6 text-center text-zinc-500">
          Article not found.
          <div className="mt-3"><Link to="/" className="text-accent text-sm hover:underline">Back to feed</Link></div>
        </div>
      </AppShell>
    );
  }

  const region = REGIONS.find((r) => r.id === article.region)?.label ?? article.region;
  const lang = LANGUAGES.find((l) => l.id === article.language);

  return (
    <AppShell>
      <div className="px-4 pt-4 pb-2">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-accent">
          <ArrowLeft className="size-3.5" /> Back
        </Link>
      </div>
      <article className="px-4 pb-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] tracking-widest text-accent uppercase">{article.source}</span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs text-zinc-400">{region}</span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="font-mono text-[10px] uppercase text-zinc-500">{article.category}</span>
          {lang && lang.id !== "en" ? <span className="font-mono text-[10px] text-zinc-500 ml-auto">{lang.native}</span> : null}
        </div>

        <h1 className="text-2xl font-semibold leading-tight text-zinc-100 text-balance">{article.title}</h1>
        <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
          {new Date(article.published_at).toLocaleString()}
        </p>

        {article.image_url ? (
          <img src={article.image_url} alt="" className="w-full aspect-[16/9] object-cover rounded-md ring-1 ring-hairline" />
        ) : null}

        {article.ai_summary ? (
          <div className="rounded-md bg-white/[0.02] p-4 ring-1 ring-white/10 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent" />
              <span className="font-mono text-[10px] font-medium tracking-wider text-zinc-300 uppercase">AI Synthesis</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">{article.ai_summary}</p>
          </div>
        ) : null}

        {article.description ? <p className="text-sm leading-relaxed text-zinc-400">{article.description}</p> : null}
        {article.content ? <p className="text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap">{article.content}</p> : null}

        {article.tags?.length ? (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {article.tags.map((t: string) => (
              <span key={t} className="rounded-full bg-white/5 ring-1 ring-hairline px-2.5 py-0.5 text-[10px] font-mono text-zinc-400">#{t}</span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-2">
          <Link
            to="/chat"
            search={{ q: `Tell me more about: ${article.title}` }}
            className="w-full rounded-md bg-accent text-accent-foreground font-semibold text-sm py-3 inline-flex items-center justify-center gap-2"
          >
            <MessageSquareText className="size-4" /> Ask AI about this story
          </Link>
          {article.source_url ? (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-md bg-white/5 ring-1 ring-hairline text-zinc-300 font-semibold text-sm py-3 inline-flex items-center justify-center gap-2 hover:bg-white/10"
            >
              <ExternalLink className="size-4" /> Open source
            </a>
          ) : null}
        </div>
      </article>
    </AppShell>
  );
}
