type Item = { id: string; headline: string };

export function BreakingTicker({ items }: { items: Item[] }) {
  if (!items.length) return null;
  const doubled = [...items, ...items];
  return (
    <div className="bg-accent text-accent-foreground py-1.5 overflow-hidden border-y border-accent/40">
      <div className="flex items-center gap-3 whitespace-nowrap px-4 max-w-xl mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 font-mono">Flash</span>
        <div className="overflow-hidden flex-1">
          <div className="animate-marquee gap-12 whitespace-nowrap text-[11px] font-medium">
            {doubled.map((it, i) => (
              <span key={`${it.id}-${i}`} className="mr-12">
                ● {it.headline}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
