import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search as SearchIcon, Sparkles } from "lucide-react";
import { AppShell } from "@/components/news/AppShell";
import { FilterBar, DEFAULT_FILTERS, type Filters } from "@/components/news/FilterBar";
import { semanticSearch } from "@/lib/news/news.functions";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Semantic Search — AXON.INTEL" },
      { name: "description", content: "Search the news semantically with vector embeddings — find stories by meaning, not keywords." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  const search = useServerFn(semanticSearch);
  const m = useMutation({
    mutationFn: (q: string) =>
      search({ data: { query: q, region: filters.region, language: filters.language, category: filters.category } }),
  });

  return (
    <AppShell title="SEARCH">
      <FilterBar filters={filters} onChange={setFilters} />
      <form
        className="p-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) m.mutate(query.trim());
        }}
      >
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What's the latest on AI chip supply?"
            className="w-full bg-panel ring-1 ring-hairline rounded-md pl-9 pr-3 py-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-accent"
          />
        </div>
        <p className="text-[11px] text-zinc-500 px-1 flex items-center gap-1.5">
          <Sparkles className="size-3 text-accent" /> Semantic search powered by vector embeddings + RAG
        </p>
      </form>

      {m.isPending ? (
        <div className="px-4 py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      ) : m.data?.results?.length ? (
        <div className="divide-y divide-hairline">
          {m.data.results.map((r: any) => (
            <Link
              key={r.chunk_id}
              to="/article/$id"
              params={{ id: r.article_id }}
              className="block px-4 py-4 space-y-2 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-widest text-accent uppercase">{r.source}</span>
                <span className="font-mono text-[10px] text-zinc-500">{Math.round(r.similarity * 100)}% match</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{r.title}</h3>
              <p className="text-xs text-zinc-500 line-clamp-2">{r.content}</p>
            </Link>
          ))}
        </div>
      ) : m.data ? (
        <div className="px-4 py-16 text-center text-zinc-500 text-sm">No matching articles found.</div>
      ) : (
        <div className="px-4 py-16 text-center text-zinc-600 text-xs font-mono uppercase tracking-widest">
          Enter a query to search
        </div>
      )}
    </AppShell>
  );
}
