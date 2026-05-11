"use server";

import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { cashDrawerShifts, payments } from "@/db/schema";
import { requireRole, requireTenantScope } from "@/server/repos/tenant-scope";
import type { ActionState } from "./types";

const openSchema = z.object({
  openingFloatMajor: z.coerce.number().min(0).max(100_000).default(0),
});

const closeSchema = z.object({
  closingCountMajor: z.coerce.number().min(0).max(1_000_000),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function getCurrentOpenShift(tenantId: string, locationId: string) {
  const [row] = await db
    .select()
    .from(cashDrawerShifts)
    .where(
      and(
        eq(cashDrawerShifts.tenantId, tenantId),
        eq(cashDrawerShifts.locationId, locationId),
        isNull(cashDrawerShifts.closedAt),
      ),
    )
    .orderBy(desc(cashDrawerShifts.openedAt))
    .limit(1);
  return row ?? null;
}

export async function listShifts(slug: string, limit = 50) {
  const scope = await requireTenantScope(slug);
  return db
    .select()
    .from(cashDrawerShifts)
    .where(
      and(
        eq(cashDrawerShifts.tenantId, scope.tenantId),
        eq(cashDrawerShifts.locationId, scope.locationId),
      ),
    )
    .orderBy(desc(cashDrawerShifts.openedAt))
    .limit(limit);
}

export async function openShiftAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "cashier");

  const existing = await getCurrentOpenShift(scope.tenantId, scope.locationId);
  if (existing) return { status: "error", message: "A shift is already open" };

  const parsed = openSchema.safeParse({
    openingFloatMajor: formData.get("openingFloatMajor") || 0,
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  await db.insert(cashDrawerShifts).values({
    tenantId: scope.tenantId,
    locationId: scope.locationId,
    openedByUserId: scope.userId,
    openingFloatMinor: Math.round(parsed.data.openingFloatMajor * 100),
  });

  revalidatePath(`/[locale]/${slug}/admin/shifts`, "page");
  return { status: "ok" };
}

export async function closeShiftAction(
  slug: string,
  shiftId: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "cashier");

  const parsed = closeSchema.safeParse({
    closingCountMajor: formData.get("closingCountMajor"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  const closingCountMinor = Math.round(parsed.data.closingCountMajor * 100);

  await db.transaction(async (tx) => {
    const [shift] = await tx
      .select()
      .from(cashDrawerShifts)
      .where(
        and(
          eq(cashDrawerShifts.tenantId, scope.tenantId),
          eq(cashDrawerShifts.id, shiftId),
        ),
      )
      .limit(1);
    if (!shift || shift.closedAt) return;

    // Sum of cash payments tied to this shift
    const [agg] = await tx
      .select({
        cash: sql<number>`COALESCE(SUM(${payments.amountMinor} + ${payments.tipMinor}), 0)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, scope.tenantId),
          eq(payments.shiftId, shiftId),
          eq(payments.method, "cash"),
          isNull(payments.refundedAt),
        ),
      );
    const cashTaken = agg?.cash ?? 0;
    const expected = shift.openingFloatMinor + cashTaken;
    const variance = closingCountMinor - expected;

    await tx
      .update(cashDrawerShifts)
      .set({
        closedAt: new Date(),
        closedByUserId: scope.userId,
        closingCountMinor,
        expectedMinor: expected,
        varianceMinor: variance,
        notes: parsed.data.notes || null,
      })
      .where(eq(cashDrawerShifts.id, shiftId));
  });

  revalidatePath(`/[locale]/${slug}/admin/shifts`, "page");
  return { status: "ok" };
}
