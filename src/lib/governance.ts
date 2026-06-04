/**
 * Governance Policy Module
 * Defines RBAC (Role-Based Access Control) and data access policies
 */

import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ===== Role Definitions =====
export type UserRole = "admin" | "user" | "anonymous";

export interface AccessPolicy {
  roles: UserRole[];
  actions: string[];
  resources: string[];
}

// ===== User Role Resolution =====

/**
 * Determine user role based on user object
 */
export function getUserRole(user: User | null): UserRole {
  if (!user) return "anonymous";
  // Check if user is admin (can be extended with metadata checks)
  if (user.user_metadata?.role === "admin") return "admin";
  return "user";
}

// ===== Access Policies =====

export const POLICIES: Record<string, AccessPolicy> = {
  articles: {
    roles: ["admin", "user", "anonymous"],
    actions: ["read"],
    resources: ["public_articles", "published_articles"],
  },
  preferences: {
    roles: ["admin", "user"],
    actions: ["read", "write"],
    resources: ["own_preferences"],
  },
  conversations: {
    roles: ["admin", "user"],
    actions: ["read", "write"],
    resources: ["own_conversations"],
  },
  alerts: {
    roles: ["admin", "user", "anonymous"],
    actions: ["read"],
    resources: ["public_alerts"],
  },
  ingest: {
    roles: ["admin"],
    actions: ["write"],
    resources: ["articles"],
  },
};

// ===== Permission Checking =====

/**
 * Check if user has permission to perform action on resource
 */
export function hasPermission(
  userRole: UserRole,
  resource: string,
  action: string
): boolean {
  const policy = POLICIES[resource];
  if (!policy) return false;

  const hasRole = policy.roles.includes(userRole);
  const hasAction = policy.actions.includes(action);
  const hasResource = policy.resources.some(
    (r) => r === resource || r.startsWith(resource)
  );

  return hasRole && hasAction && hasResource;
}

/**
 * Verify user owns the resource (for RLS verification)
 */
export async function verifyResourceOwnership(
  userId: string,
  resourceType: "conversation" | "preference",
  resourceId: string
): Promise<boolean> {
  try {
    if (resourceType === "conversation") {
      const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("id", resourceId)
        .eq("user_id", userId)
        .single();
      return !error && !!data;
    }

    if (resourceType === "preference") {
      const { data, error } = await supabaseAdmin
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", userId)
        .single();
      return !error && !!data;
    }

    return false;
  } catch {
    return false;
  }
}

// ===== Data Filtering Policies =====

/**
 * Filter data based on user role and ownership
 */
export interface DataFilterPolicy {
  filterPublic: boolean; // Only public/published items
  filterOwned: boolean; // Only user-owned items
  maxResults: number; // Max items to return
}

export function getFilterPolicy(userRole: UserRole): DataFilterPolicy {
  switch (userRole) {
    case "admin":
      return { filterPublic: false, filterOwned: false, maxResults: 10000 };
    case "user":
      return { filterPublic: false, filterOwned: true, maxResults: 1000 };
    case "anonymous":
      return { filterPublic: true, filterOwned: false, maxResults: 100 };
    default:
      return { filterPublic: true, filterOwned: false, maxResults: 100 };
  }
}

// ===== Data Sensitivity Classification =====

/**
 * Classify data sensitivity levels
 */
export enum DataSensitivity {
  PUBLIC = "public",        // Visible to anonymous users
  INTERNAL = "internal",    // Only visible to authenticated users
  PRIVATE = "private",      // Only visible to owner
  CONFIDENTIAL = "confidential", // Only visible to admin
}

/**
 * Get maximum sensitivity level user can access
 */
export function getMaxDataSensitivity(userRole: UserRole): DataSensitivity {
  switch (userRole) {
    case "admin":
      return DataSensitivity.CONFIDENTIAL;
    case "user":
      return DataSensitivity.PRIVATE;
    case "anonymous":
      return DataSensitivity.PUBLIC;
    default:
      return DataSensitivity.PUBLIC;
  }
}

// ===== Activity Logging for Compliance =====

export interface ComplianceLog {
  timestamp: string;
  userId?: string;
  action: string;
  resource: string;
  dataClassified: DataSensitivity;
  status: "allowed" | "denied";
  reason?: string;
}

const complianceLogs: ComplianceLog[] = [];

/**
 * Log data access for compliance/audit
 */
export function logDataAccess(
  userId: string | undefined,
  action: string,
  resource: string,
  dataClassified: DataSensitivity,
  allowed: boolean,
  reason?: string
): void {
  const log: ComplianceLog = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    resource,
    dataClassified,
    status: allowed ? "allowed" : "denied",
    reason,
  };

  complianceLogs.push(log);

  // Keep only last 5000 logs
  if (complianceLogs.length > 5000) {
    complianceLogs.shift();
  }

  // Log denials immediately
  if (!allowed) {
    console.warn("[COMPLIANCE]", log);
  }
}

/**
 * Get compliance logs (admin only)
 */
export function getComplianceLogs(userRole: UserRole): ComplianceLog[] {
  if (userRole !== "admin") {
    return [];
  }
  return complianceLogs;
}

// ===== Data Retention Policies =====

export interface RetentionPolicy {
  resource: string;
  retentionDays: number;
  archiveAfterDays?: number;
  deletionSchedule?: "immediate" | "weekly" | "monthly";
}

export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    resource: "conversations",
    retentionDays: 365, // 1 year
    deletionSchedule: "monthly",
  },
  {
    resource: "messages",
    retentionDays: 365,
    deletionSchedule: "monthly",
  },
  {
    resource: "audit_logs",
    retentionDays: 90, // 3 months
    deletionSchedule: "weekly",
  },
  {
    resource: "articles",
    retentionDays: 0, // Keep indefinitely
  },
];

/**
 * Check if resource should be archived/deleted based on retention policy
 */
export function isResourceExpired(
  createdAt: Date,
  resourceType: string
): boolean {
  const policy = RETENTION_POLICIES.find((p) => p.resource === resourceType);
  if (!policy || policy.retentionDays === 0) return false;

  const expirationDate = new Date(createdAt);
  expirationDate.setDate(expirationDate.getDate() + policy.retentionDays);

  return new Date() > expirationDate;
}

// ===== Namespace Isolation =====

/**
 * Ensure multi-tenancy isolation (if implemented)
 */
export interface TenantContext {
  tenantId?: string;
  userId?: string;
  role: UserRole;
}

/**
 * Build RLS query context for tenant isolation
 */
export function buildTenantContext(
  userId: string | undefined,
  role: UserRole
): TenantContext {
  return {
    userId,
    role,
    // tenantId would be set from organization/workspace context
  };
}
