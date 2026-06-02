import { Link } from "@tanstack/react-router";
import { Sparkles, MessageSquareText } from "lucide-react";
import { LANGUAGES, REGIONS } from "@/lib/news/constants";

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

export type ArticleSummary = {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  description?: string | null;
  ai_summary?: string | null;
  category: string;
  region: string;
  language: string;
  tags?: string[] | null;
  image_url?: string | null;
  published_at: string;
  is_breaking?: boolean | null;
};

export function ArticleCard({ article }: { article: ArticleSummary }) {
  const region = REGIONS.find((r) => r.id === article.region)?.label ?? article.region;
  const lang = LANGUAGES.find((l) => l.id === article.language);
  return (
    <article className="animate-slide-up space-y-3 px-4 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] tracking-widest text-accent uppercase truncate">{article.source}</span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs font-medium text-zinc-400 truncate">{region}</span>
        </div>
        <span className="rounded-sm border border-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent uppercase shrink-0">
          {article.category}
        </span>
      </div>

      <Link to="/article/$id" params={{ id: article.id }} className="block">
        <h2 className="text-balance text-lg font-semibold leading-tight text-zinc-100 hover:text-accent transition-colors">
          {article.title}
        </h2>
      </Link>

      {article.image_url ? (
        <Link to="/article/$id" params={{ id: article.id }}>
          <img
            src={article.image_url}
            alt=""
            loading="lazy"
            className="w-full aspect-[16/9] object-cover rounded-md ring-1 ring-hairline bg-panel"
          />
        </Link>
      ) : null}

      {article.ai_summary ? (
        <div className="relative rounded-md bg-white/[0.02] p-3.5 ring-1 ring-white/10">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-accent" strokeWidth={2.2} />
            <span className="font-mono text-[10px] font-medium tracking-wider text-zinc-300 uppercase">AI Synthesis</span>
            {lang && lang.id !== "en" ? (
              <span className="font-mono text-[10px] text-zinc-500 ml-auto">{lang.native}</span>
            ) : null}
          </div>
          <p className="text-pretty text-sm leading-relaxed text-zinc-400">{article.ai_summary}</p>
        </div>
      ) : article.description ? (
        <p className="text-sm leading-relaxed text-zinc-400">{article.description}</p>
      ) : null}

      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-tighter">
          {timeAgo(article.published_at)}
        </span>
        <Link
          to="/chat"
          search={{ q: `Tell me more about: ${article.title}` }}
          className="flex items-center gap-1.5 rounded-full bg-accent py-1.5 pr-3 pl-2 text-xs font-semibold text-accent-foreground ring-1 ring-accent"
        >
          <MessageSquareText className="size-3.5" strokeWidth={2.4} />
          Ask AI
        </Link>
      </div>
    </article>
  );
}
