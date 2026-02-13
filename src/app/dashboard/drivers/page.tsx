import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { drivers } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { DriverTable } from "./driver-table";
import { Plus } from "lucide-react";

export default async function DriversPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const allDrivers = await db
    .select()
    .from(drivers)
    .where(eq(drivers.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader title="Drivers" description="Manage your drivers">
        <Link href="/dashboard/drivers/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Driver
          </Button>
        </Link>
      </PageHeader>
      <DriverTable drivers={allDrivers} />
    </div>
  );
}
