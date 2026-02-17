import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

const ASSETS = ["logo.png", "bus-mascot.png", "bus-icon.png", "favicon.png"];

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 }
    );
  }

  const { env } = await getCloudflareContext({ async: true });
  const origin = new URL(request.url).origin;
  const results: Record<string, string> = {};

  for (const file of ASSETS) {
    const res = await fetch(`${origin}/${file}`);

    if (!res.ok) {
      results[file] = `failed (${res.status})`;
      continue;
    }

    const buffer = await res.arrayBuffer();
    await env.R2.put(file, buffer, {
      httpMetadata: {
        contentType: res.headers.get("content-type") || "image/png",
      },
    });

    results[file] = "uploaded";
  }

  return NextResponse.json({ message: "Assets seeded to R2", results });
}
