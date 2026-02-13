import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { schools, students } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { SchoolTable } from "./school-table";
import { Plus } from "lucide-react";

export default async function SchoolsPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const allSchools = await db
    .select()
    .from(schools)
    .where(eq(schools.orgId, orgId));

  const studentCounts = await db
    .select({
      schoolId: students.schoolId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(students)
    .where(eq(students.orgId, orgId))
    .groupBy(students.schoolId);

  const countsMap: Record<string, number> = {};
  for (const row of studentCounts) {
    countsMap[row.schoolId] = row.count;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Schools" description="Manage schools in your organization">
        <Link href="/dashboard/schools/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add School
          </Button>
        </Link>
      </PageHeader>
      <SchoolTable schools={allSchools} studentCounts={countsMap} />
    </div>
  );
}
