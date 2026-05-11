"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users, memberships, tenants } from "@/db/schema";
import {
  clearImpersonationCookie,
  setImpersonationCookie,
} from "./impersonation";
import { auditLog } from "@/db/schema";

export async function startImpersonationAction(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  if (!session.user.isPlatformAdmin) throw new Error("FORBIDDEN");

  if (targetUserId === session.user.id) {
    return; // can't impersonate yourself; no-op
  }

  // Confirm target user exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw new Error("Target user not found");

  await setImpersonationCookie(target.id, session.user.id);

  // Find a tenant the target belongs to so we can land somewhere useful
  const [m] = await db
    .select({ slug: tenants.slug })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(memberships.userId, target.id))
    .limit(1);

  // Audit (tenant-less is awkward; we attach to the first tenant they belong to if any)
  if (m) {
    const [t] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, m.slug))
      .limit(1);
    if (t) {
      await db.insert(auditLog).values({
        tenantId: t.id,
        actorUserId: target.id,
        actorImpersonatedBy: session.user.id,
        action: "platform.impersonate_start",
        entity: "user",
        entityId: target.id,
        before: null,
        after: { byUserId: session.user.id },
      });
    }
  }

  if (m) {
    redirect(`/${m.slug}/admin`);
  }
  redirect("/");
}

export async function stopImpersonationAction() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");

  await clearImpersonationCookie();
  redirect("/platform");
}
