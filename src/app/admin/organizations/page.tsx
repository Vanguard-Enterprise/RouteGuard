import { requireSuperAdmin } from "@/lib/auth";
import { getDb } from "@/db";
import { organizations, users, schools } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrgTable } from "./org-table";
import { Plus } from "lucide-react";

export default async function OrganizationsPage() {
  await requireSuperAdmin();
  const db = await getDb();

  const [allOrgs, userCounts, schoolCounts] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.type, "district")).orderBy(organizations.name),
    db.select({ orgId: users.orgId, value: count() }).from(users).groupBy(users.orgId),
    db.select({ orgId: schools.orgId, value: count() }).from(schools).groupBy(schools.orgId),
  ]);

  const userCountMap = Object.fromEntries(userCounts.map((r) => [r.orgId, r.value]));
  const schoolCountMap = Object.fromEntries(schoolCounts.map((r) => [r.orgId, r.value]));

  const orgsWithCounts = allOrgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    type: org.type,
    timezone: org.timezone,
    createdAt: org.createdAt,
    userCount: userCountMap[org.id] ?? 0,
    schoolCount: schoolCountMap[org.id] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" description="Manage all platform organizations">
        <Link href="/admin/organizations/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </Link>
      </PageHeader>
      <OrgTable organizations={orgsWithCounts} />
    </div>
  );
}
