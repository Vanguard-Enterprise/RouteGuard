import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const db = await getDb();
    const connections = await db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.orgId, id))
      .orderBy(ssoConnections.createdAt);

    return NextResponse.json(connections);
  } catch (error) {
    console.error("GET sso connections error:", error);
    return NextResponse.json({ error: "Failed to fetch SSO connections." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const db = await getDb();

    if (!body.displayName || !body.domain) {
      return NextResponse.json(
        { error: "Display name and domain are required." },
        { status: 400 },
      );
    }

    // Check domain uniqueness
    const [existing] = await db
      .select({ id: ssoConnections.id })
      .from(ssoConnections)
      .where(eq(ssoConnections.domain, body.domain.toLowerCase()))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "An SSO connection with this domain already exists." },
        { status: 409 },
      );
    }

    // Validate OIDC fields if type is oidc
    if (body.type === "oidc") {
      if (!body.oidcIssuerUrl || !body.oidcClientId || !body.oidcClientSecret) {
        return NextResponse.json(
          { error: "OIDC connections require issuer URL, client ID, and client secret." },
          { status: 400 },
        );
      }
    }

    const [connection] = await db
      .insert(ssoConnections)
      .values({
        orgId,
        type: body.type || "oidc",
        displayName: body.displayName,
        domain: body.domain.toLowerCase(),
        enabled: body.enabled !== false,
        oidcIssuerUrl: body.oidcIssuerUrl || null,
        oidcClientId: body.oidcClientId || null,
        oidcClientSecret: body.oidcClientSecret || null,
        oidcScopes: body.oidcScopes || "openid email profile",
      })
      .returning();

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error("POST sso connection error:", error);
    return NextResponse.json({ error: "Failed to create SSO connection." }, { status: 500 });
  }
}
