import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; connectionId: string }> },
) {
  try {
    const { id: orgId, connectionId } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const db = await getDb();

    const [existing] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, connectionId), eq(ssoConnections.orgId, orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "SSO connection not found." }, { status: 404 });
    }

    // If domain is changing, check uniqueness
    if (body.domain && body.domain.toLowerCase() !== existing.domain) {
      const [domainTaken] = await db
        .select({ id: ssoConnections.id })
        .from(ssoConnections)
        .where(and(
          eq(ssoConnections.domain, body.domain.toLowerCase()),
          ne(ssoConnections.id, connectionId),
        ))
        .limit(1);

      if (domainTaken) {
        return NextResponse.json(
          { error: "An SSO connection with this domain already exists." },
          { status: 409 },
        );
      }
    }

    const [updated] = await db
      .update(ssoConnections)
      .set({
        displayName: body.displayName ?? existing.displayName,
        domain: body.domain ? body.domain.toLowerCase() : existing.domain,
        type: body.type ?? existing.type,
        enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
        oidcIssuerUrl: body.oidcIssuerUrl !== undefined ? (body.oidcIssuerUrl || null) : existing.oidcIssuerUrl,
        oidcClientId: body.oidcClientId !== undefined ? (body.oidcClientId || null) : existing.oidcClientId,
        oidcClientSecret: body.oidcClientSecret !== undefined ? (body.oidcClientSecret || null) : existing.oidcClientSecret,
        oidcScopes: body.oidcScopes !== undefined ? (body.oidcScopes || "openid email profile") : existing.oidcScopes,
        updatedAt: new Date(),
      })
      .where(eq(ssoConnections.id, connectionId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT sso connection error:", error);
    return NextResponse.json({ error: "Failed to update SSO connection." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; connectionId: string }> },
) {
  try {
    const { id: orgId, connectionId } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const db = await getDb();

    const [existing] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, connectionId), eq(ssoConnections.orgId, orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "SSO connection not found." }, { status: 404 });
    }

    await db.delete(ssoConnections).where(eq(ssoConnections.id, connectionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE sso connection error:", error);
    return NextResponse.json({ error: "Failed to delete SSO connection." }, { status: 500 });
  }
}
