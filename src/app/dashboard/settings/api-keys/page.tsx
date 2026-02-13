import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { ApiKeysManagement } from "@/components/dashboard/api-keys-management";
import type { UserRole } from "@/db/schema";

export default async function ApiKeysPage() {
  const { user, orgId } = await requireAuth();

  if (!hasPermission(user.role as UserRole, "api_keys:manage")) {
    redirect("/dashboard");
  }

  const db = await getDb();
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      permissions: apiKeys.permissions,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage API keys for programmatic access to your organization's data"
      />
      <ApiKeysManagement
        apiKeys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          permissions: k.permissions ?? "{}",
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
