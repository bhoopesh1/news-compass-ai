import { createFileRoute } from "@tanstack/react-router";
import { ingestNews } from "@/lib/news/news.functions";
import {
  withSecurity,
  ValidationSchemas,
  INGEST_RATE_LIMIT,
  extractBearerToken,
  sanitizeError,
} from "@/lib/security";

/**
 * Public news ingestion endpoint
 * Rate limited: 10 requests per hour per IP
 * Requires valid API token in Authorization header
 */
export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return withSecurity(
          request,
          async (req) => {
            try {
              // Verify API token
              const authHeader = req.headers.get("authorization");
              const token = extractBearerToken(authHeader);
              const validToken = process.env.PUBLIC_API_TOKEN;

              if (!token || !validToken || token !== validToken) {
                return new Response(
                  JSON.stringify({
                    error: "Unauthorized: Invalid or missing API token",
                  }),
                  {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                  }
                );
              }

              // Validate input
              let body: unknown;
              try {
                body = await req.json();
              } catch {
                return new Response(
                  JSON.stringify({ error: "Invalid JSON payload" }),
                  {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                  }
                );
              }

              const validated = ValidationSchemas.ingestPayload.parse(body);

              // Execute ingestion
              const result = await ingestNews({ data: { useSeed: validated.useSeed } });

              return new Response(JSON.stringify(result), {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "no-store",
                },
              });
            } catch (error) {
              return new Response(
                JSON.stringify({
                  error: sanitizeError(error),
                  ...(process.env.NODE_ENV === "development" && {
                    details: error instanceof Error ? error.message : undefined,
                  }),
                }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
          },
          {
            rateLimit: INGEST_RATE_LIMIT,
          }
        );
      },
    },
  },
});
