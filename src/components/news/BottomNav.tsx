import { Link, useLocation } from "@tanstack/react-router";
import { Bell, Home, MessageSquareText, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", icon: Home, label: "Feed" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/chat", icon: MessageSquareText, label: "Assistant" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/preferences", icon: Settings, label: "You" },
];

export function BottomNav() {
  const location = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-hairline pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5 max-w-xl mx-auto">
        {items.map((item) => {
          const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium tracking-wide uppercase transition-colors",
                  active ? "text-accent" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.2]")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
