import { requireAuth } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { UsersManagement } from "@/components/dashboard/users-management";
import type { UserRole } from "@/db/schema";

export default async function UsersSettingsPage() {
  const { user, orgId } = await requireAuth();

  if (!canManageUsers(user.role as UserRole)) {
    redirect("/dashboard");
  }

  const db = await getDb();
  const orgUsers = await db
    .select()
    .from(users)
    .where(eq(users.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage users and roles in your organization"
      />
      <UsersManagement
        users={orgUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
        currentUserId={user.id}
      />
    </div>
  );
}
