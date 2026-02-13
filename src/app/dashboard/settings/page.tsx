import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrgSettingsForm } from "@/components/dashboard/org-settings-form";
import type { UserRole } from "@/db/schema";

export default async function SettingsPage() {
  const { user, orgId } = await requireAuth();

  if (
    !hasPermission(user.role as UserRole, "settings:write") &&
    !hasPermission(user.role as UserRole, "org:manage")
  ) {
    redirect("/dashboard");
  }

  const db = await getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Settings"
        description="Manage your organization's profile and preferences"
      />
      <OrgSettingsForm organization={org} />
    </div>
  );
}
