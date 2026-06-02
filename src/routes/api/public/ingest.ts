import { createFileRoute } from "@tanstack/react-router";
import { ingestNews } from "@/lib/news/news.functions";

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let useSeed = false;
        try {
          const body = await request.json();
          useSeed = Boolean(body?.useSeed);
        } catch {}
        const result = await ingestNews({ data: { useSeed } });
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
