import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";

const COOKIE = "__imp";
const TTL_MS = 60 * 60 * 1000; // 1 hour

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function pack(asUserId: string, byUserId: string, exp: number): string {
  const payload = `${asUserId}.${byUserId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function unpack(
  value: string,
): { asUserId: string; byUserId: string; exp: number } | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [asUserId, byUserId, expStr, sig] = parts;
  if (!asUserId || !byUserId || !expStr || !sig) return null;

  const expectedSig = sign(`${asUserId}.${byUserId}.${expStr}`);
  let a: Buffer, b: Buffer;
  try {
    a = Buffer.from(sig, "hex");
    b = Buffer.from(expectedSig, "hex");
  } catch {
    return null;
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return { asUserId, byUserId, exp };
}

export async function setImpersonationCookie(
  asUserId: string,
  byUserId: string,
): Promise<void> {
  const exp = Date.now() + TTL_MS;
  const c = await cookies();
  c.set(COOKIE, pack(asUserId, byUserId, exp), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearImpersonationCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getImpersonationState(): Promise<{
  asUserId: string;
  byUserId: string;
} | null> {
  const c = await cookies();
  const v = c.get(COOKIE)?.value;
  if (!v) return null;
  const parsed = unpack(v);
  if (!parsed) return null;
  return { asUserId: parsed.asUserId, byUserId: parsed.byUserId };
}

export type EffectiveSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    isPlatformAdmin: boolean;
  };
  realUserId: string;
  impersonating: boolean;
} | null;

/**
 * Returns the effective session: the real session, OR the impersonated user's identity
 * if a valid impersonation cookie is set AND the real user is a platform admin.
 *
 * All tenant-scoped code should call this instead of `auth()` so impersonation works.
 */
export async function effectiveAuth(): Promise<EffectiveSession> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const realUserId = session.user.id;
  const isPlatformAdmin = !!session.user.isPlatformAdmin;

  if (isPlatformAdmin) {
    const imp = await getImpersonationState();
    if (imp && imp.byUserId === realUserId && imp.asUserId !== realUserId) {
      const [u] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, imp.asUserId))
        .limit(1);
      if (u) {
        return {
          user: {
            id: u.id,
            email: u.email,
            name: u.name,
            isPlatformAdmin: false,
          },
          realUserId,
          impersonating: true,
        };
      }
    }
  }

  return {
    user: {
      id: realUserId,
      email: session.user.email ?? "",
      name: session.user.name ?? null,
      isPlatformAdmin,
    },
    realUserId,
    impersonating: false,
  };
}

/** Returns info for the impersonation banner: who's pretending to be whom. */
export async function getImpersonationBannerData(): Promise<{
  realName: string | null;
  realEmail: string;
  asName: string | null;
  asEmail: string;
} | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isPlatformAdmin) return null;
  const imp = await getImpersonationState();
  if (!imp || imp.byUserId !== session.user.id || imp.asUserId === session.user.id)
    return null;

  const [as] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, imp.asUserId))
    .limit(1);
  if (!as) return null;

  return {
    realName: session.user.name ?? null,
    realEmail: session.user.email ?? "",
    asName: as.name,
    asEmail: as.email,
  };
}
