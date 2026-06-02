import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, title = "AXON.INTEL" }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-surface text-zinc-200 pb-20">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-hairline">
        <div className="flex h-14 items-center justify-between px-4 max-w-xl mx-auto">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="size-6 bg-accent rounded-sm flex items-center justify-center">
              <div className="size-2.5 bg-surface rounded-full" />
            </div>
            <span className="font-mono text-sm font-medium tracking-tighter text-zinc-100">{title}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/search" className="size-9 grid place-items-center rounded-full hover:bg-white/5 text-zinc-300" aria-label="Search">
              <Search className="size-4" />
            </Link>
            <Link to="/alerts" className="relative size-9 grid place-items-center rounded-full hover:bg-white/5 text-zinc-300" aria-label="Alerts">
              <Bell className="size-4" />
              <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent ring-2 ring-surface" />
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-xl mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
