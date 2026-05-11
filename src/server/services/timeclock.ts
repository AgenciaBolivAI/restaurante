"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { timeClockEntries } from "@/db/schema";
import { requireTenantScope } from "@/server/repos/tenant-scope";

export async function getActiveEntry(tenantId: string, userId: string) {
  const [row] = await db
    .select()
    .from(timeClockEntries)
    .where(
      and(
        eq(timeClockEntries.tenantId, tenantId),
        eq(timeClockEntries.userId, userId),
        isNull(timeClockEntries.clockOut),
      ),
    )
    .orderBy(desc(timeClockEntries.clockIn))
    .limit(1);
  return row ?? null;
}

export async function clockInAction(slug: string) {
  const scope = await requireTenantScope(slug);

  const existing = await getActiveEntry(scope.tenantId, scope.userId);
  if (existing) return; // Already clocked in

  await db.insert(timeClockEntries).values({
    tenantId: scope.tenantId,
    userId: scope.userId,
    clockIn: new Date(),
  });

  revalidatePath(`/[locale]/${slug}/pos`, "layout");
  revalidatePath(`/[locale]/${slug}/admin/employees`, "page");
}

export async function clockOutAction(slug: string) {
  const scope = await requireTenantScope(slug);

  const existing = await getActiveEntry(scope.tenantId, scope.userId);
  if (!existing) return;

  await db
    .update(timeClockEntries)
    .set({ clockOut: new Date() })
    .where(eq(timeClockEntries.id, existing.id));

  revalidatePath(`/[locale]/${slug}/pos`, "layout");
  revalidatePath(`/[locale]/${slug}/admin/employees`, "page");
}
