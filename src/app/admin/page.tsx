import { requireSuperAdmin } from "@/lib/auth";
import { getDb } from "@/db";
import {
  organizations,
  users,
  schools,
  students,
  trips,
} from "@/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Users, School, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";

export default async function AdminOverviewPage() {
  await requireSuperAdmin();
  const db = await getDb();

  const today = new Date().toISOString().split("T")[0];

  const [
    [{ value: totalOrgs }],
    [{ value: totalUsers }],
    [{ value: totalSchools }],
    [{ value: totalStudents }],
    [{ value: activeTrips }],
    recentOrgs,
  ] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(schools),
    db.select({ value: count() }).from(students),
    db
      .select({ value: count() })
      .from(trips)
      .where(eq(trips.status, "in_progress")),
    db
      .select()
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(5),
  ]);

  return (
    <>
      <PageHeader
        title="Admin Overview"
        description="Platform-wide metrics and recent activity."
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Organizations"
          value={totalOrgs}
          description="Total organizations"
          icon={Building2}
        />
        <MetricCard
          title="Users"
          value={totalUsers}
          description="All platform users"
          icon={Users}
        />
        <MetricCard
          title="Schools"
          value={totalSchools}
          description="Across all orgs"
          icon={School}
        />
        <MetricCard
          title="Students"
          value={totalStudents}
          description="Across all orgs"
          icon={GraduationCap}
        />
        <MetricCard
          title="Active Trips"
          value={activeTrips}
          description="Currently in progress"
          icon={MapPin}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        className="font-medium hover:underline"
                      >
                        {org.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                    <TableCell className="capitalize">{org.type}</TableCell>
                    <TableCell className="text-muted-foreground">{org.timezone}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.createdAt
                        ? new Date(org.createdAt).toLocaleDateString()
                        : "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
