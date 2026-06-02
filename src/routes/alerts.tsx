import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Loader2 } from "lucide-react";
import { AppShell } from "@/components/news/AppShell";
import { getAlerts } from "@/lib/news/news.functions";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alerts — AXON.INTEL" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const fn = useServerFn(getAlerts);
  const q = useQuery({ queryKey: ["alerts", "all"], queryFn: () => fn() });
  const alerts = q.data?.alerts ?? [];

  return (
    <AppShell title="ALERTS">
      <div className="px-4 py-5 border-b border-hairline">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-accent" />
          <h1 className="text-lg font-semibold text-zinc-100">Breaking alerts</h1>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Real-time flags raised by the Alert Agent when ingesting articles.
        </p>
      </div>
      {q.isLoading ? (
        <div className="px-4 py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div>
      ) : alerts.length === 0 ? (
        <div className="px-4 py-16 text-center text-zinc-500 text-sm">No alerts yet.</div>
      ) : (
        <ul className="divide-y divide-hairline">
          {alerts.map((a) => (
            <li key={a.id}>
              {a.article_id ? (
                <Link to="/article/$id" params={{ id: a.article_id }} className="block px-4 py-4 hover:bg-white/[0.02]">
                  <AlertRow a={a} />
                </Link>
              ) : (
                <div className="px-4 py-4"><AlertRow a={a} /></div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function AlertRow({ a }: { a: any }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-accent uppercase">{a.severity}</span>
        <span className="text-xs text-zinc-600">/</span>
        <span className="text-xs text-zinc-400">{a.region}</span>
        <span className="ml-auto text-[10px] font-mono text-zinc-500">
          {new Date(a.created_at).toLocaleString()}
        </span>
      </div>
      <p className="text-sm text-zinc-100 leading-snug">{a.headline}</p>
    </div>
  );
}
