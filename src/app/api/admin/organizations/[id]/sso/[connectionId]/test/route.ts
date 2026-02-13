import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchOidcDiscovery } from "@/lib/sso";

export async function POST(
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
    const [connection] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, connectionId), eq(ssoConnections.orgId, orgId)))
      .limit(1);

    if (!connection) {
      return NextResponse.json({ error: "SSO connection not found." }, { status: 404 });
    }

    if (!connection.oidcIssuerUrl) {
      return NextResponse.json({ error: "No OIDC issuer URL configured." }, { status: 400 });
    }

    const discovery = await fetchOidcDiscovery(connection.oidcIssuerUrl);

    return NextResponse.json({
      success: true,
      issuer: discovery.issuer,
      authorization_endpoint: discovery.authorization_endpoint,
      token_endpoint: discovery.token_endpoint,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Test SSO connection error:", error);
    return NextResponse.json(
      { error: `OIDC discovery failed: ${message}` },
      { status: 400 },
    );
  }
}
