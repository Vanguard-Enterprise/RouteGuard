import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Organization } from "@/db/schema";

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const db = await getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return org ?? null;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const db = await getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org ?? null;
}

export function orgWhere(orgId: string) {
  return { orgId };
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
