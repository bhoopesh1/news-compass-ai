/**
 * Security & Governance Testing Examples
 * These examples show how to use security utilities in your application
 */

// ===== Testing Rate Limiting =====

import {
  checkRateLimit,
  rateLimitResponse,
  ValidationSchemas,
  withSecurity,
  API_RATE_LIMIT,
  INGEST_RATE_LIMIT,
} from "@/lib/security";

import {
  getUserRole,
  hasPermission,
  verifyResourceOwnership,
  getFilterPolicy,
  getMaxDataSensitivity,
  logDataAccess,
  DataSensitivity,
} from "@/lib/governance";

/**
 * Example 1: Check rate limit for a client
 */
function exampleRateLimit() {
  const clientIp = "192.168.1.1";

  // Check rate limit
  const result = checkRateLimit(clientIp, API_RATE_LIMIT);

  if (!result.allowed) {
    console.log(`Rate limited. Wait ${result.resetIn}ms`);
    return rateLimitResponse(result.resetIn);
  }

  console.log(`Request allowed. ${result.remaining} requests remaining`);
}

/**
 * Example 2: Validate input with Zod schema
 */
function exampleInputValidation() {
  const payload = {
    messages: [{ role: "user", content: "Hello" }],
    conversationId: "123e4567-e89b-12d3-a456-426614174000",
    filters: { region: "us", language: "en" },
  };

  try {
    const validated = ValidationSchemas.chatPayload.parse(payload);
    console.log("Input validated successfully:", validated);
  } catch (error) {
    console.error("Validation failed:", error);
  }
}

/**
 * Example 3: Secure API handler wrapper
 */
async function exampleSecureHandler() {
  const request = new Request("https://example.com/api/test", {
    method: "POST",
    headers: {
      "Authorization": "Bearer token123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ test: "data" }),
  });

  const response = await withSecurity(
    request,
    async (req, clientId) => {
      console.log(`Handling request from ${clientId}`);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
    {
      rateLimit: API_RATE_LIMIT,
    }
  );

  console.log("Response:", response.status);
}

// ===== Testing Governance =====

/**
 * Example 4: Check user permissions
 */
function examplePermissions() {
  const userRole = getUserRole({
    id: "user-123",
    email: "user@example.com",
    user_metadata: { role: "user" },
  } as any);

  const canRead = hasPermission(userRole, "articles", "read");
  const canWrite = hasPermission(userRole, "articles", "write");

  console.log("Can read articles:", canRead); // true
  console.log("Can write articles:", canWrite); // false
}

/**
 * Example 5: Get data access policy for user role
 */
function exampleDataPolicy() {
  const role = "user";
  const policy = getFilterPolicy(role as any);

  console.log("Filter public only:", policy.filterPublic); // false
  console.log("Filter owned resources:", policy.filterOwned); // true
  console.log("Max results:", policy.maxResults); // 1000
}

/**
 * Example 6: Get maximum data sensitivity level
 */
function exampleDataSensitivity() {
  const adminLevel = getMaxDataSensitivity("admin");
  const userLevel = getMaxDataSensitivity("user");
  const anonLevel = getMaxDataSensitivity("anonymous");

  console.log("Admin can access:", adminLevel); // confidential
  console.log("User can access:", userLevel); // private
  console.log("Anonymous can access:", anonLevel); // public
}

/**
 * Example 7: Log data access for compliance
 */
function exampleComplianceLogging() {
  logDataAccess(
    "user-123",
    "read",
    "articles",
    DataSensitivity.PUBLIC,
    true,
    "User read public articles"
  );

  logDataAccess(
    "user-456",
    "write",
    "conversations",
    DataSensitivity.PRIVATE,
    false,
    "User attempted to write to another user's conversation"
  );
}

/**
 * Example 8: Verify resource ownership
 */
async function exampleResourceOwnership() {
  try {
    const isOwner = await verifyResourceOwnership(
      "user-123",
      "conversation",
      "conv-456"
    );

    if (isOwner) {
      console.log("User owns this conversation - access allowed");
    } else {
      console.log("User does not own this conversation - access denied");
    }
  } catch (error) {
    console.error("Ownership verification failed:", error);
  }
}

// ===== Integration Example =====

/**
 * Example 9: Complete secure API endpoint
 */
async function exampleCompleteEndpoint(request: Request) {
  return withSecurity(
    request,
    async (req, clientId) => {
      try {
        // 1. Extract authentication
        const authHeader = req.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(
            JSON.stringify({ error: "Missing auth token" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }

        // 2. Parse input
        const body = await req.json();

        // 3. Validate input
        const validated = ValidationSchemas.chatPayload.parse(body);

        // 4. Check permissions
        const userRole = "user";
        if (!hasPermission(userRole, "conversations", "write")) {
          logDataAccess(
            "user-123",
            "write",
            "conversations",
            DataSensitivity.PRIVATE,
            false,
            "Permission denied"
          );
          return new Response(
            JSON.stringify({ error: "Access denied" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }

        // 5. Process request
        const result = await processChat(validated);

        // 6. Log success
        logDataAccess(
          "user-123",
          "write",
          "conversations",
          DataSensitivity.PRIVATE,
          true,
          "Chat processed successfully"
        );

        // 7. Return response
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Endpoint error:", error);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    },
    {
      rateLimit: API_RATE_LIMIT,
    }
  );
}

async function processChat(payload: any): Promise<any> {
  // Your chat processing logic
  return { success: true, conversationId: "conv-123" };
}

// ===== Testing Helper Functions =====

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log("\n=== Security & Governance Examples ===\n");

  console.log("1. Rate Limiting Example:");
  exampleRateLimit();

  console.log("\n2. Input Validation Example:");
  exampleInputValidation();

  console.log("\n3. Secure Handler Example:");
  await exampleSecureHandler();

  console.log("\n4. Permissions Example:");
  examplePermissions();

  console.log("\n5. Data Policy Example:");
  exampleDataPolicy();

  console.log("\n6. Data Sensitivity Example:");
  exampleDataSensitivity();

  console.log("\n7. Compliance Logging Example:");
  exampleComplianceLogging();

  console.log("\n8. Resource Ownership Example:");
  await exampleResourceOwnership();

  console.log("\n=== Examples Complete ===\n");
}

// Run if executed directly
if (import.meta.main) {
  runAllExamples().catch(console.error);
}
