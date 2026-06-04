# News Compass AI - Security & Governance Guide

## Overview
This document outlines the security architecture, governance policies, and best practices for the News Compass AI application.

---

## 1. Security Architecture

### 1.1 Authentication & Authorization

#### Bearer Token Authentication
- All authenticated endpoints require a valid Bearer token in the `Authorization` header
- Tokens are validated against Supabase auth tokens
- Token format: `Authorization: Bearer <token>`

**Implementation:**
```typescript
const token = extractBearerToken(authHeader);
if (!token) return new Response("Unauthorized", { status: 401 });
```

#### API Token (Public Endpoints)
- Public ingestion endpoint requires a valid `PUBLIC_API_TOKEN`
- Set via environment variable: `PUBLIC_API_TOKEN`
- Required in `Authorization` header

### 1.2 Rate Limiting

Rate limits are implemented per IP address to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/public/ingest` | 10 requests | 1 hour |
| `/api/chat` | 30 requests | 1 minute |
| Default API endpoints | 60 requests | 1 minute |

**Rate Limit Response:**
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 3600
}
```
Status: `429 Too Many Requests`
Header: `Retry-After: <seconds>`

### 1.3 Input Validation

All API inputs are validated using Zod schemas:

#### Ingest Payload
```typescript
{
  useSeed: boolean // default: false
}
```

#### Chat Payload
```typescript
{
  messages: Array<{
    role: "user" | "assistant" | "system",
    content: string // 1-10000 chars
  }>,
  conversationId?: string (UUID),
  filters?: {
    region?: string,
    language?: string,
    category?: string
  }
}
```

#### News Filters
```typescript
{
  region?: string,
  language?: string,
  category?: string,
  timeRange?: string,
  limit: number // 1-50, default: 20
}
```

### 1.4 Security Headers

The following security headers are automatically added to all API responses:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), ...
```

### 1.5 Error Handling

**Development Mode:**
- Full error details exposed for debugging
- Set `NODE_ENV=development`

**Production Mode:**
- Sanitized error messages only
- Stack traces never exposed
- Errors logged to console/audit log

**Error Response Example:**
```json
{
  "error": "Internal server error",
  "retryAfter": 60
}
```

---

## 2. Governance Policies

### 2.1 Data Access Control

#### Public Routes (No Auth Required)
- `/` - Homepage
- `/login` - Authentication page
- `/article/:id` - Individual article view
- `/search` - Search page
- `/alerts` - Alerts page

#### Protected Routes (Auth Required)
- `/chat` - AI assistant (requires login)
- `/preferences` - User preferences (requires login)

#### Admin/Public API Routes
- `/api/public/ingest` - News ingestion (requires `PUBLIC_API_TOKEN`)
- `/api/chat` - Chat API (requires Supabase token)

### 2.2 Row Level Security (RLS)

#### Articles Table
- **Public read**: Anyone can read published articles
- **Admin write**: Only service role can insert/update articles

#### Conversations Table
- **User read**: Users can only read their own conversations
- **User write**: Users can only insert their own conversations

#### Messages Table
- **User read**: Users can only read messages in their conversations
- **User write**: Users can only insert messages in their conversations

#### User Preferences Table
- **User read/write**: Users can only access their own preferences
- **Service role**: Full access

#### Alerts Table
- **Public read**: Anyone can read published alerts
- **Admin write**: Only service role can manage alerts

### 2.3 Audit Logging

All API requests are logged with:
- Timestamp (ISO 8601)
- Client IP address
- Endpoint and HTTP method
- Request status code
- Processing duration
- User ID (if authenticated)
- Error message (if failed)

**Audit Log Structure:**
```typescript
{
  timestamp: string,
  action: string,
  userId?: string,
  clientId: string,
  endpoint: string,
  method: string,
  status: number,
  duration: number,
  error?: string
}
```

**Accessing Logs:**
```typescript
import { getAuditLogs } from "@/lib/security";
const logs = getAuditLogs();
```

### 2.4 Secrets Management

#### Environment Variables Required
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Server-side only

# API Keys
LOVABLE_API_KEY=sk-...           # AI gateway token
PUBLIC_API_TOKEN=your-token      # Public API authentication

# Environment
NODE_ENV=production
CORS_ORIGIN=https://your-domain.com
```

#### Best Practices
1. Never commit `.env` files
2. Rotate API keys quarterly
3. Use different keys for dev/staging/production
4. Store secrets in CI/CD environment variables
5. Use `process.env` only in `.server.ts` files
6. Public variables use `VITE_` prefix only

---

## 3. API Documentation

### 3.1 POST /api/public/ingest

**Purpose:** Ingest news articles

**Authentication:** API Token (Bearer)
**Rate Limit:** 10 requests/hour
**Content-Type:** application/json

**Request:**
```bash
curl -X POST https://your-domain/api/public/ingest \
  -H "Authorization: Bearer YOUR_PUBLIC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"useSeed": false}'
```

**Response (200):**
```json
{
  "inserted": 45,
  "skipped": 12,
  "errors": 0
}
```

**Error Responses:**
- `401` - Invalid or missing API token
- `400` - Invalid JSON payload
- `429` - Rate limit exceeded

---

### 3.2 POST /api/chat

**Purpose:** Chat with AI news assistant

**Authentication:** Supabase Bearer Token
**Rate Limit:** 30 requests/minute
**Content-Type:** application/json
**Response:** Server-Sent Events (text/event-stream)

**Request:**
```bash
curl -X POST https://your-domain/api/chat \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What are the latest AI news?"}],
    "filters": {"region": "us", "language": "en"}
  }'
```

**Response Stream:**
```
data: {"type":"meta","citations":[...],"conversationId":"..."}

data: {"choices":[{"delta":{"content":"The latest..."}}]}
data: {"choices":[{"delta":{"content":" AI news"}}]}

data: [DONE]
```

**Error Responses:**
- `401` - Invalid or missing token
- `400` - Invalid request format
- `429` - Rate limit exceeded
- `402` - AI service quota exceeded
- `500` - Server error

---

## 4. Security Checklist

### Before Deployment
- [ ] All environment variables set securely
- [ ] `PUBLIC_API_TOKEN` changed from default
- [ ] CORS_ORIGIN configured correctly
- [ ] SUPABASE_SERVICE_ROLE_KEY in `.server.ts` files only
- [ ] No secrets in version control
- [ ] Rate limits reviewed and appropriate
- [ ] Security headers enabled
- [ ] Error logging configured
- [ ] Audit logging enabled
- [ ] Input validation schemas verified

### Regular Maintenance
- [ ] Rotate API keys monthly
- [ ] Review audit logs weekly
- [ ] Check rate limit metrics
- [ ] Update dependencies
- [ ] Scan for vulnerable packages: `npm audit`
- [ ] Review security headers
- [ ] Test authentication flows
- [ ] Verify error sanitization

### Incident Response
1. Check audit logs: `getAuditLogs()`
2. Identify affected user/IP
3. Rotate compromised tokens
4. Review access patterns
5. Update rate limits if needed
6. Document incident

---

## 5. Compliance & Privacy

### Data Retention
- **Conversations**: Retained indefinitely (user can delete)
- **Messages**: Retained with conversation
- **Articles**: Retained for archival purposes
- **Audit Logs**: Retained for 90 days

### GDPR Compliance
- Users can export their data
- Users can delete their accounts
- Preferences are user-specific
- No third-party tracking

### Encryption
- All data in transit: TLS 1.2+
- All data at rest: Supabase encryption
- API keys: Environment variable only
- Tokens: Short-lived (Supabase manages)

---

## 6. Testing & Validation

### Security Testing
```bash
# Test rate limiting
for i in {1..11}; do
  curl -X POST https://your-domain/api/public/ingest \
    -H "Authorization: Bearer TEST_TOKEN"
done

# Test missing auth
curl -X POST https://your-domain/api/chat

# Test invalid input
curl -X POST https://your-domain/api/chat \
  -d '{"messages": []}'
```

### Audit Log Testing
```typescript
import { logAudit, getAuditLogs } from "@/lib/security";

logAudit({
  action: "test_action",
  clientId: "127.0.0.1",
  endpoint: "/api/test",
  method: "POST",
  status: 200,
  duration: 100,
});

console.log(getAuditLogs());
```

---

## 7. Troubleshooting

### "Unauthorized: Invalid or missing API token"
- Verify `PUBLIC_API_TOKEN` environment variable is set
- Check token is passed in `Authorization: Bearer <token>` format
- Ensure token is not expired

### "Rate limit exceeded"
- Check `Retry-After` header for wait time
- Implement exponential backoff in client
- Contact support for higher limits if needed

### "Invalid request format"
- Validate request JSON matches schema
- Check all required fields are present
- Verify field types match schema

### "AI gateway error"
- Check `LOVABLE_API_KEY` is valid
- Verify Lovable API is accessible
- Check API quota hasn't been exceeded
- Review error details in development mode

---

## 8. References

- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Zod Validation](https://zod.dev/)
- [GDPR Compliance](https://gdpr-info.eu/)

---

## 9. Contact & Support

For security issues:
- Report privately via security@your-domain.com
- Do not open public issues for security vulnerabilities
- Allow 48 hours for initial response

For questions about governance:
- Contact the development team
- See CONTRIBUTING.md for guidelines

---

**Last Updated:** June 2026
**Maintained By:** Security Team
**Version:** 1.0.0
