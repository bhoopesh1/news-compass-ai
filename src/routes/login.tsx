import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — AXON.INTEL" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) {
      toast.error(r.error.message);
      setLoading(false);
      return;
    }
    if (r.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-surface text-zinc-200 flex flex-col">
      <div className="flex-1 grid place-items-center px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <Link to="/" className="flex items-center gap-2.5 justify-center">
            <div className="size-7 bg-accent rounded-sm grid place-items-center">
              <div className="size-3 bg-surface rounded-full" />
            </div>
            <span className="font-mono text-base font-medium tracking-tighter text-zinc-100">AXON.INTEL</span>
          </Link>
          <div className="text-center space-y-1">
            <h1 className="text-xl font-semibold text-zinc-100">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm text-zinc-500">AI-powered news intelligence.</p>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full rounded-md bg-white text-zinc-900 font-medium text-sm py-2.5 disabled:opacity-50 hover:bg-zinc-100 transition-colors"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
            <div className="h-px flex-1 bg-hairline" /> or <div className="h-px flex-1 bg-hairline" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-panel ring-1 ring-hairline rounded-md px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-accent"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel ring-1 ring-hairline rounded-md px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-accent"
            />
            <button
              disabled={loading}
              className="w-full rounded-md bg-accent text-accent-foreground font-semibold text-sm py-2.5 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Sign up"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
          >
            {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
          </button>

          <p className="text-center text-[11px] text-zinc-600">
            <Link to="/" className="hover:text-zinc-400">Continue browsing without an account →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
