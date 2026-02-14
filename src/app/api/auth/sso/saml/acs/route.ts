import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import {
  consumeOAuthState,
  parseSamlResponse,
  validateSamlSignature,
  checkSamlStatus,
  validateSamlConditions,
  extractSamlAttributes,
  findOrCreateSsoUser,
  getSamlSpConfig,
} from "@/lib/sso";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const samlResponse = formData.get("SAMLResponse") as string | null;
    const relayState = formData.get("RelayState") as string | null;

    if (!samlResponse || !relayState) {
      return NextResponse.redirect(
        new URL("/login?error=missing_params", request.url),
      );
    }

    // RelayState is the OAuth state token
    const oauthState = await consumeOAuthState(relayState);
    if (!oauthState || oauthState.flowType !== "customer_saml") {
      return NextResponse.redirect(
        new URL("/login?error=invalid_state", request.url),
      );
    }

    if (!oauthState.connectionId) {
      return NextResponse.redirect(
        new URL("/login?error=missing_connection", request.url),
      );
    }

    // Load SSO connection
    const db = await getDb();
    const [connection] = await db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.id, oauthState.connectionId))
      .limit(1);

    if (!connection || !connection.samlCertificate) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_connection", request.url),
      );
    }

    // Parse the SAML response
    const doc = parseSamlResponse(samlResponse);

    // Validate signature
    const signatureValid = await validateSamlSignature(
      samlResponse,
      connection.samlCertificate,
    );
    if (!signatureValid) {
      console.error("SAML signature validation failed");
      return NextResponse.redirect(
        new URL("/login?error=saml_error", request.url),
      );
    }

    // Check Status is Success
    checkSamlStatus(doc);

    // Validate Conditions (NotBefore/NotOnOrAfter, Audience)
    const origin = request.nextUrl.origin;
    const { entityId } = getSamlSpConfig(origin);
    validateSamlConditions(doc, entityId);

    // Extract user attributes
    const attrs = extractSamlAttributes(doc);

    if (!attrs.email) {
      return NextResponse.redirect(
        new URL("/login?error=no_email", request.url),
      );
    }

    // Find or create the user
    const user = await findOrCreateSsoUser({
      email: attrs.email,
      name: attrs.name || attrs.email,
      ssoId: attrs.nameId,
      orgId: connection.orgId,
      authProvider: "saml",
    });

    // Create session and redirect
    await createSession(user.id);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("SAML ACS error:", error);
    return NextResponse.redirect(
      new URL("/login?error=saml_error", request.url),
    );
  }
}
