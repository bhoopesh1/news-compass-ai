import { CATEGORIES, LANGUAGES, REGIONS, TIME_RANGES } from "@/lib/news/constants";
import { cn } from "@/lib/utils";

export type Filters = {
  region: string;
  language: string;
  category: string;
  timeRange: string;
};

export const DEFAULT_FILTERS: Filters = {
  region: "all",
  language: "all",
  category: "all",
  timeRange: "24h",
};

type Group = {
  key: keyof Filters;
  label: string;
  options: { id: string; label: string; native?: string }[];
};

const groups: Group[] = [
  { key: "region", label: "Region", options: [{ id: "all", label: "All regions" }, ...REGIONS.map((r) => ({ id: r.id, label: r.label }))] },
  { key: "language", label: "Language", options: [{ id: "all", label: "All languages" }, ...LANGUAGES.map((l) => ({ id: l.id, label: l.label, native: l.native }))] },
  { key: "category", label: "Category", options: [{ id: "all", label: "All categories" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))] },
  { key: "timeRange", label: "Time", options: TIME_RANGES.map((t) => ({ id: t.id, label: t.label })) },
];

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  return (
    <div className="border-b border-hairline">
      {groups.map((group) => (
        <div key={group.key} className="px-4 py-2 first:pt-3 last:pb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{group.label}</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {group.options.map((opt) => {
              const active = filters[group.key] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onChange({ ...filters, [group.key]: opt.id })}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ring-1",
                    active
                      ? "bg-accent text-accent-foreground ring-accent"
                      : "bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10",
                  )}
                >
                  {opt.native && group.key === "language" && opt.id !== "all" ? (
                    <span><span className="font-medium">{opt.native}</span> <span className="opacity-50">{opt.label}</span></span>
                  ) : opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
