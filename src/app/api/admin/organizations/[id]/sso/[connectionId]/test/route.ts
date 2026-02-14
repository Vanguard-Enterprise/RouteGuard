import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchOidcDiscovery, fetchSamlMetadata } from "@/lib/sso";

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

    // OIDC test
    if (connection.type === "oidc") {
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
    }

    // SAML test
    if (connection.type === "saml") {
      if (connection.samlMetadataUrl) {
        const metadata = await fetchSamlMetadata(connection.samlMetadataUrl);
        return NextResponse.json({
          success: true,
          entityId: metadata.entityId,
          ssoUrl: metadata.ssoUrl,
          hasCertificate: !!metadata.certificate,
        });
      }

      if (!connection.samlSsoUrl) {
        return NextResponse.json({ error: "No SAML SSO URL configured." }, { status: 400 });
      }

      // Verify SSO URL is reachable
      const res = await fetch(connection.samlSsoUrl, { method: "HEAD" });
      return NextResponse.json({
        success: true,
        ssoUrl: connection.samlSsoUrl,
        reachable: res.ok || res.status === 405 || res.status === 302,
      });
    }

    return NextResponse.json({ error: "Unknown connection type." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Test SSO connection error:", error);
    return NextResponse.json(
      { error: `SSO test failed: ${message}` },
      { status: 400 },
    );
  }
}
