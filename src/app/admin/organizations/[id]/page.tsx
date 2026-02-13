import { requireSuperAdmin } from "@/lib/auth";
import { getDb } from "@/db";
import { organizations, users, schools, students, vehicles, routes } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, ArrowLeft, Users, School, GraduationCap, Bus, Route } from "lucide-react";
import { SsoConnectionsCard } from "@/components/admin/sso-connections-card";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSuperAdmin();
  const db = await getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);

  if (!org) {
    notFound();
  }

  const [
    [{ value: userCount }],
    [{ value: schoolCount }],
    [{ value: studentCount }],
    [{ value: vehicleCount }],
    [{ value: routeCount }],
    orgUsers,
    orgSchools,
  ] = await Promise.all([
    db.select({ value: count() }).from(users).where(eq(users.orgId, id)),
    db.select({ value: count() }).from(schools).where(eq(schools.orgId, id)),
    db.select({ value: count() }).from(students).where(eq(students.orgId, id)),
    db.select({ value: count() }).from(vehicles).where(eq(vehicles.orgId, id)),
    db.select({ value: count() }).from(routes).where(eq(routes.orgId, id)),
    db.select().from(users).where(eq(users.orgId, id)),
    db.select().from(schools).where(eq(schools.orgId, id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={org.name} description={`Organization details for ${org.slug}`}>
        <Link href="/admin/organizations">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Link href={`/admin/organizations/${org.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </Link>
        <DeleteOrgButton orgId={org.id} hasChildren={userCount > 0 || schoolCount > 0 || studentCount > 0} />
      </PageHeader>

      {/* Org Info */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="font-mono font-medium">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                <Badge variant="secondary" className="capitalize">{org.type}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="font-medium">{org.timezone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "--"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* SSO Connections */}
      <SsoConnectionsCard orgId={org.id} />

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard title="Users" value={userCount} icon={Users} />
        <MetricCard title="Schools" value={schoolCount} icon={School} />
        <MetricCard title="Students" value={studentCount} icon={GraduationCap} />
        <MetricCard title="Vehicles" value={vehicleCount} icon={Bus} />
        <MetricCard title="Routes" value={routeCount} icon={Route} />
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({userCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {orgUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users in this organization.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {u.role.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Schools Table */}
      <Card>
        <CardHeader>
          <CardTitle>Schools ({schoolCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {orgSchools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schools in this organization.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgSchools.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[s.address, s.city, s.state, s.zip].filter(Boolean).join(", ") || "--"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.contactName || "--"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.phone || "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteOrgButton({ orgId, hasChildren }: { orgId: string; hasChildren: boolean }) {
  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={hasChildren}
      title={hasChildren ? "Cannot delete org with existing records" : "Delete organization"}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Delete
    </Button>
  );
}
