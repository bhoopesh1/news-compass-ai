/**
 * Security utilities and middleware
 * Provides rate limiting, request validation, and security headers
 */

import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";

// ===== Rate Limiting =====
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
};

export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
};

export const INGEST_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
};

/**
 * Get client identifier from request
 */
function getClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("cf-connecting-ip") || "unknown";
}

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetTime) {
    // Create or reset entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowMs,
    };
  }

  const remaining = config.maxRequests - entry.count;
  if (entry.count < config.maxRequests) {
    entry.count++;
    return {
      allowed: true,
      remaining: remaining - 1,
      resetIn: entry.resetTime - now,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    resetIn: entry.resetTime - now,
  };
}

/**
 * Create rate limit response
 */
export function rateLimitResponse(resetIn: number): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter: Math.ceil(resetIn / 1000),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": Math.ceil(resetIn / 1000).toString(),
      },
    }
  );
}

// ===== Security Headers =====
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
};

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ===== Input Validation =====
export const ValidationSchemas = {
  ingestPayload: z.object({
    useSeed: z.boolean().default(false),
  }),

  chatPayload: z.object({
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(10000),
      })
    ),
    conversationId: z.string().uuid().optional().nullable(),
    filters: z
      .object({
        region: z.string().max(50).optional(),
        language: z.string().max(10).optional(),
        category: z.string().max(50).optional(),
      })
      .optional(),
  }),

  newsFilters: z.object({
    region: z.string().optional(),
    language: z.string().optional(),
    category: z.string().optional(),
    timeRange: z.string().optional(),
    limit: z.number().min(1).max(50).default(20),
  }),

  preferences: z.object({
    regions: z.array(z.string()).min(1).max(10),
    languages: z.array(z.string()).min(1).max(10),
    categories: z.array(z.string()).min(1).max(10),
    alerts_enabled: z.boolean(),
  }),
};

// ===== Audit Logging =====
export interface AuditLog {
  timestamp: string;
  action: string;
  userId?: string;
  clientId: string;
  endpoint: string;
  method: string;
  status: number;
  duration: number;
  error?: string;
}

const auditLogs: AuditLog[] = [];

export function logAudit(log: Omit<AuditLog, "timestamp">): void {
  const fullLog: AuditLog = {
    ...log,
    timestamp: new Date().toISOString(),
  };

  // Store in memory (in production, send to external logging service)
  auditLogs.push(fullLog);

  // Keep only last 1000 logs in memory
  if (auditLogs.length > 1000) {
    auditLogs.shift();
  }

  // Log to console for debugging
  if (log.status >= 400 || log.error) {
    console.error("[AUDIT]", fullLog);
  }
}

export function getAuditLogs(): AuditLog[] {
  return auditLogs;
}

// ===== Secure API Handler Wrapper =====
export interface SecureHandlerOptions {
  requireAuth?: boolean;
  rateLimit?: RateLimitConfig;
  validateInput?: z.Schema;
}

export async function withSecurity(
  request: Request,
  handler: (req: Request, clientId: string) => Promise<Response>,
  options: SecureHandlerOptions = {}
): Promise<Response> {
  const startTime = Date.now();
  const clientId = getClientId(request);
  const method = request.method;
  const url = new URL(request.url);
  const endpoint = url.pathname;

  try {
    // Rate limiting
    if (options.rateLimit) {
      const rateLimitResult = checkRateLimit(clientId, options.rateLimit);
      if (!rateLimitResult.allowed) {
        const response = rateLimitResponse(rateLimitResult.resetIn);
        logAudit({
          action: "rate_limit_exceeded",
          clientId,
          endpoint,
          method,
          status: 429,
          duration: Date.now() - startTime,
        });
        return response;
      }
    }

    // Execute handler
    const response = await handler(request, clientId);
    const duration = Date.now() - startTime;

    logAudit({
      action: "request_processed",
      clientId,
      endpoint,
      method,
      status: response.status,
      duration,
    });

    // Add security headers
    const headers = new Headers(response.headers);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logAudit({
      action: "request_error",
      clientId,
      endpoint,
      method,
      status: 500,
      duration,
      error: errorMessage,
    });

    console.error(`[${endpoint}] ${errorMessage}`);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        // Don't expose error details in production
        ...(process.env.NODE_ENV === "development" && { details: errorMessage }),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      }
    );
  }
}

// ===== Token Validation =====
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token && token.length > 0 ? token : null;
}

export function validateRequestSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Simple HMAC validation - in production use proper crypto
  try {
    const crypto = require("crypto");
    const hash = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return hash === signature;
  } catch {
    return false;
  }
}

// ===== Clean Error Messages =====
export function sanitizeError(error: any): string {
  if (error instanceof Error) {
    // Only return safe error messages
    if (error.message.includes("Unauthorized")) return "Unauthorized";
    if (error.message.includes("Not found")) return "Resource not found";
    if (error.message.includes("validation")) return "Invalid input";
    return "An error occurred";
  }
  return "An error occurred";
}
