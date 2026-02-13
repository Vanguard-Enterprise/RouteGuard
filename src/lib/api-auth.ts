import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateApiKey(): Promise<{ key: string; keyHash: string; keyPrefix: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = "rg_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const keyHash = await hashKey(key);
  const keyPrefix = key.slice(0, 10);
  return { key, keyHash, keyPrefix };
}

export async function validateApiKey(key: string): Promise<{ orgId: string; permissions: Record<string, boolean> } | null> {
  const keyHash = await hashKey(key);
  const db = await getDb();

  const [apiKey] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!apiKey) return null;

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update last used
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id));

  const permissions = apiKey.permissions ? JSON.parse(apiKey.permissions) : {};
  return { orgId: apiKey.orgId, permissions };
}

export async function authenticateApiRequest(request: Request): Promise<{ orgId: string; permissions: Record<string, boolean> } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7);
  return validateApiKey(key);
}
