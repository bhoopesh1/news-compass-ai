import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut } from "lucide-react";
import { AppShell } from "@/components/news/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { CATEGORIES, LANGUAGES, REGIONS } from "@/lib/news/constants";
import { getPreferences, updatePreferences } from "@/lib/news/news.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/preferences")({
  head: () => ({ meta: [{ title: "Preferences — AXON.INTEL" }] }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getPreferences);
  const updateFn = useServerFn(updatePreferences);

  const prefsQ = useQuery({
    queryKey: ["preferences"],
    queryFn: () => getFn(),
    enabled: !!user,
  });

  const [regions, setRegions] = useState<string[]>(["global"]);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [categories, setCategories] = useState<string[]>(["general"]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  useEffect(() => {
    const p = prefsQ.data?.preferences;
    if (p) {
      setRegions(p.regions ?? ["global"]);
      setLanguages(p.languages ?? ["en"]);
      setCategories(p.categories ?? ["general"]);
      setAlertsEnabled(p.alerts_enabled ?? true);
    }
  }, [prefsQ.data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { regions, languages, categories, alerts_enabled: alertsEnabled } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Preferences saved.");
        queryClient.invalidateQueries({ queryKey: ["preferences"] });
      } else toast.error(r.error ?? "Failed");
    },
  });

  if (loading) {
    return <AppShell title="YOU"><div className="p-10 grid place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div></AppShell>;
  }

  if (!user) {
    return (
      <AppShell title="YOU">
        <div className="p-6 space-y-4 text-center">
          <h2 className="text-base font-semibold text-zinc-100">Sign in to personalize</h2>
          <p className="text-sm text-zinc-500">Personalize your feed by region, language, and category, and save chat history.</p>
          <Link to="/login" className="inline-block rounded-md bg-accent text-accent-foreground font-semibold text-sm py-2.5 px-6">Sign in</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="YOU">
      <div className="px-4 py-5 border-b border-hairline flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">Signed in as</p>
          <p className="text-sm text-zinc-100 truncate">{user.email}</p>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/" });
          }}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-accent"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </div>

      <PrefGroup
        label="Regions"
        options={REGIONS.map((r) => ({ id: r.id, label: r.label }))}
        selected={regions}
        onChange={setRegions}
      />
      <PrefGroup
        label="Languages"
        options={LANGUAGES.map((l) => ({ id: l.id, label: `${l.native} · ${l.label}` }))}
        selected={languages}
        onChange={setLanguages}
      />
      <PrefGroup
        label="Categories"
        options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
        selected={categories}
        onChange={setCategories}
      />

      <div className="px-4 py-4 border-b border-hairline flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-100">Breaking news alerts</p>
          <p className="text-xs text-zinc-500">Notify me when the Alert Agent flags breaking stories.</p>
        </div>
        <button
          role="switch"
          aria-checked={alertsEnabled}
          onClick={() => setAlertsEnabled((v) => !v)}
          className={`w-10 h-6 rounded-full ring-1 ring-hairline transition-colors ${alertsEnabled ? "bg-accent" : "bg-panel"}`}
        >
          <span className={`block size-5 bg-white rounded-full mt-0.5 transition-transform ${alertsEnabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="p-4">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full rounded-md bg-accent text-accent-foreground font-semibold text-sm py-3 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save preferences
        </button>
      </div>
    </AppShell>
  );
}

function PrefGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }
  return (
    <div className="px-4 py-4 border-b border-hairline">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${active ? "bg-accent text-accent-foreground ring-accent" : "bg-white/5 text-zinc-300 ring-hairline hover:bg-white/10"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
