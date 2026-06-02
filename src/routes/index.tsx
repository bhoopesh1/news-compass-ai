import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Newspaper, Sparkles } from "lucide-react";
import { AppShell } from "@/components/news/AppShell";
import { ArticleCard, type ArticleSummary } from "@/components/news/ArticleCard";
import { BreakingTicker } from "@/components/news/BreakingTicker";
import { FilterBar, DEFAULT_FILTERS, type Filters } from "@/components/news/FilterBar";
import { getAlerts, ingestNews, listArticles } from "@/lib/news/news.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AXON.INTEL — AI News Intelligence" },
      { name: "description", content: "Personalized multilingual news feed with AI summaries, semantic search, and a conversational news assistant." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const list = useServerFn(listArticles);
  const alertsFn = useServerFn(getAlerts);
  const ingestFn = useServerFn(ingestNews);

  const articlesQuery = useQuery({
    queryKey: ["articles", filters],
    queryFn: () => list({ data: { ...filters, limit: 30 } }),
  });
  const alertsQuery = useQuery({ queryKey: ["alerts"], queryFn: () => alertsFn() });

  const ingest = useMutation({
    mutationFn: (useSeed: boolean) => ingestFn({ data: { useSeed } }),
    onSuccess: (r) => {
      toast.success(`Ingested ${r.inserted} articles (${r.skipped} duplicates skipped).`);
      articlesQuery.refetch();
      alertsQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ingestion failed"),
  });

  // Auto-trigger seed ingestion on first visit if feed is empty
  const articles = (articlesQuery.data?.articles ?? []) as ArticleSummary[];
  useEffect(() => {
    if (!articlesQuery.isLoading && articles.length === 0 && !ingest.isPending) {
      ingest.mutate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articlesQuery.isLoading]);

  return (
    <AppShell>
      <FilterBar filters={filters} onChange={setFilters} />
      <BreakingTicker
        items={(alertsQuery.data?.alerts ?? []).slice(0, 6).map((a) => ({ id: a.id, headline: a.headline }))}
      />
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-accent" />
          <h1 className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">Intelligence Feed</h1>
        </div>
        <button
          onClick={() => ingest.mutate(false)}
          disabled={ingest.isPending}
          className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-accent disabled:opacity-50 inline-flex items-center gap-1"
        >
          {ingest.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {articlesQuery.isLoading || ingest.isPending ? (
        <div className="px-4 py-20 grid place-items-center text-zinc-500">
          <Loader2 className="size-6 animate-spin text-accent" />
          <p className="mt-3 text-xs font-mono uppercase tracking-widest">
            {ingest.isPending ? "Running ingestion agents…" : "Loading feed…"}
          </p>
        </div>
      ) : articles.length === 0 ? (
        <div className="px-4 py-20 text-center text-zinc-500 space-y-3">
          <Newspaper className="size-8 mx-auto text-zinc-700" />
          <p className="text-sm">No articles match your filters yet.</p>
          <button
            onClick={() => ingest.mutate(true)}
            className="text-xs font-mono uppercase tracking-widest text-accent hover:underline"
          >
            Seed sample articles
          </button>
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
