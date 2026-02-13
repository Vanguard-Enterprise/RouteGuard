import { WorkOS } from "@workos-inc/node";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users, sessions, organizations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { User, UserRole } from "@/db/schema";

let workos: WorkOS | null = null;

function getWorkOS(): WorkOS {
  if (!workos) {
    workos = new WorkOS(process.env.WORKOS_API_KEY!);
  }
  return workos;
}

const SESSION_COOKIE = "rg_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  return token;
}

export async function getSession(): Promise<{ user: User; orgId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
    }
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return null;

  return { user, orgId: user.orgId };
}

export async function requireAuth(): Promise<{ user: User; orgId: string }> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<{ user: User; orgId: string }> {
  const session = await requireAuth();
  if (!allowedRoles.includes(session.user.role as UserRole)) {
    redirect("/dashboard");
  }
  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  cookieStore.delete(SESSION_COOKIE);
}

export function getSSOAuthorizationUrl(connectionId: string, redirectUri: string): string {
  const wo = getWorkOS();
  return wo.userManagement.getAuthorizationUrl({
    provider: "authkit",
    connectionId,
    redirectUri,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });
}

export async function handleSSOCallback(code: string) {
  const wo = getWorkOS();
  const { user: ssoUser, organizationId } = await wo.userManagement.authenticateWithCode({
    code,
    clientId: process.env.WORKOS_CLIENT_ID!,
  });

  const db = await getDb();

  // Find user by SSO ID or email
  let [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.ssoId, ssoUser.id))
    .limit(1);

  if (!existingUser && ssoUser.email) {
    [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, ssoUser.email))
      .limit(1);

    if (existingUser) {
      await db
        .update(users)
        .set({ ssoId: ssoUser.id, lastLoginAt: new Date() })
        .where(eq(users.id, existingUser.id));
    }
  }

  if (!existingUser) {
    // Find org by SSO domain
    const emailDomain = ssoUser.email?.split("@")[1];
    let org = emailDomain
      ? (await db.select().from(organizations).where(eq(organizations.ssoDomain, emailDomain)).limit(1))[0]
      : null;

    if (!org) {
      return null;
    }

    const [newUser] = await db
      .insert(users)
      .values({
        orgId: org.id,
        email: ssoUser.email!,
        name: `${ssoUser.firstName ?? ""} ${ssoUser.lastName ?? ""}`.trim() || ssoUser.email!,
        role: "school_admin",
        ssoId: ssoUser.id,
        avatarUrl: ssoUser.profilePictureUrl,
        lastLoginAt: new Date(),
      })
      .returning();

    return newUser;
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), avatarUrl: ssoUser.profilePictureUrl })
    .where(eq(users.id, existingUser.id));

  return existingUser;
}

// Dev-only: create a session for a user without SSO
export async function devLogin(email: string): Promise<User | null> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return null;

  await createSession(user.id);
  return user;
}
