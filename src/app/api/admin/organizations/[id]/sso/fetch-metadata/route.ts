import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { fetchSamlMetadata } from "@/lib/sso";

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const { metadataUrl } = body;

    if (!metadataUrl || typeof metadataUrl !== "string") {
      return NextResponse.json(
        { error: "Metadata URL is required." },
        { status: 400 },
      );
    }

    const metadata = await fetchSamlMetadata(metadataUrl);

    return NextResponse.json(metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Fetch SAML metadata error:", error);
    return NextResponse.json(
      { error: `Failed to fetch SAML metadata: ${message}` },
      { status: 400 },
    );
  }
}
