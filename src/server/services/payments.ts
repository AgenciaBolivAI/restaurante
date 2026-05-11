"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  orders,
  orderItems,
  payments,
  tables,
  auditLog,
} from "@/db/schema";
import { requireRole, requireTenantScope } from "@/server/repos/tenant-scope";
import { getCurrentOpenShift } from "./shifts";
import type { ActionState } from "./types";

const paymentSchema = z.object({
  method: z.enum(["cash", "card", "transfer", "other"]),
  amountMajor: z.coerce.number().min(0).max(1_000_000),
  tipMajor: z.coerce.number().min(0).max(1_000_000).default(0),
});

const voidSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
});

/** Returns amount paid so far (minor units). */
async function totalPaidMinor(orderId: string): Promise<number> {
  const [r] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${payments.amountMinor}), 0)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.orderId, orderId),
        sql`${payments.refundedAt} IS NULL`,
      ),
    );
  return r?.sum ?? 0;
}

export async function recordPaymentAction(
  slug: string,
  orderId: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);

  const parsed = paymentSchema.safeParse({
    method: formData.get("method"),
    amountMajor: formData.get("amountMajor"),
    tipMajor: formData.get("tipMajor") || 0,
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  const amountMinor = Math.round(parsed.data.amountMajor * 100);
  const tipMinor = Math.round(parsed.data.tipMajor * 100);

  if (amountMinor <= 0) {
    return { status: "error", message: "Amount must be greater than zero" };
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, scope.tenantId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) return { status: "error", message: "Order not found" };
  if (order.status === "paid" || order.status === "void") {
    return { status: "error", message: "Order is closed" };
  }

  const alreadyPaid = await totalPaidMinor(orderId);
  const remainingMinor = order.totalMinor - alreadyPaid;
  if (amountMinor > remainingMinor + 1) {
    return {
      status: "error",
      message: "Payment exceeds remaining balance",
    };
  }

  // For cash payments, link to the currently open shift (if any)
  let shiftId: string | null = null;
  if (parsed.data.method === "cash") {
    const openShift = await getCurrentOpenShift(scope.tenantId, scope.locationId);
    shiftId = openShift?.id ?? null;
  }

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      tenantId: scope.tenantId,
      orderId,
      method: parsed.data.method,
      amountMinor,
      tipMinor,
      takenByUserId: scope.userId,
      shiftId,
    });

    const newPaid = alreadyPaid + amountMinor;
    if (newPaid >= order.totalMinor) {
      // Add tip to order total
      const [tipAgg] = await tx
        .select({
          tip: sql<number>`COALESCE(SUM(${payments.tipMinor}), 0)::int`,
        })
        .from(payments)
        .where(eq(payments.orderId, orderId));

      await tx
        .update(orders)
        .set({
          status: "paid",
          tipMinor: tipAgg?.tip ?? 0,
          closedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      // Mark all ready/preparing items as served
      await tx
        .update(orderItems)
        .set({ kdsStatus: "served" })
        .where(
          and(
            eq(orderItems.orderId, orderId),
            sql`${orderItems.kdsStatus} IN ('preparing','ready')`,
          ),
        );

      // Free the table
      if (order.tableId) {
        await tx
          .update(tables)
          .set({ status: "free" })
          .where(
            and(
              eq(tables.tenantId, scope.tenantId),
              eq(tables.id, order.tableId),
            ),
          );
      }
    }
  });

  revalidatePath(`/[locale]/${slug}/pos/orders/${orderId}`, "page");
  revalidatePath(`/[locale]/${slug}/pos`, "page");
  return { status: "ok" };
}

export async function voidItemAction(
  slug: string,
  orderId: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = voidSchema.safeParse({
    itemId: formData.get("itemId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        nameSnapshot: orderItems.nameSnapshot,
        qty: orderItems.qty,
        unitPriceMinor: orderItems.unitPriceMinor,
        kdsStatus: orderItems.kdsStatus,
        tenantId: orders.tenantId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.id, parsed.data.itemId))
      .limit(1);
    if (!item || item.tenantId !== scope.tenantId) return;
    if (item.orderId !== orderId) return;
    if (item.kdsStatus === "void") return;

    await tx
      .update(orderItems)
      .set({
        kdsStatus: "void",
        voidedAt: new Date(),
        voidReason: parsed.data.reason,
      })
      .where(eq(orderItems.id, item.id));

    // Recompute order totals (skip voided)
    const [agg] = await tx
      .select({
        subtotal: sql<number>`COALESCE(SUM(${orderItems.qty} * ${orderItems.unitPriceMinor}), 0)::int`,
        tax: sql<number>`COALESCE(SUM(${orderItems.taxMinor}), 0)::int`,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          sql`${orderItems.kdsStatus} != 'void'`,
        ),
      );
    const subtotal = agg?.subtotal ?? 0;
    const tax = agg?.tax ?? 0;
    await tx
      .update(orders)
      .set({
        subtotalMinor: subtotal,
        taxMinor: tax,
        totalMinor: subtotal + tax,
      })
      .where(eq(orders.id, orderId));

    await tx.insert(auditLog).values({
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
      action: "order_item.void",
      entity: "order_item",
      entityId: item.id,
      before: {
        kdsStatus: item.kdsStatus,
        qty: item.qty,
        unitPriceMinor: item.unitPriceMinor,
        nameSnapshot: item.nameSnapshot,
      },
      after: { kdsStatus: "void", reason: parsed.data.reason },
    });
  });

  revalidatePath(`/[locale]/${slug}/pos/orders/${orderId}`, "page");
  revalidatePath(`/[locale]/${slug}/kds/kitchen`, "page");
  revalidatePath(`/[locale]/${slug}/kds/bar`, "page");
  return { status: "ok" };
}

export async function getOrderPaymentSummary(
  slug: string,
  orderId: string,
) {
  const scope = await requireTenantScope(slug);

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, scope.tenantId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) return null;

  const ps = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(payments.paidAt);

  const paid = ps
    .filter((p) => p.refundedAt === null)
    .reduce((acc, p) => acc + p.amountMinor, 0);
  const tip = ps
    .filter((p) => p.refundedAt === null)
    .reduce((acc, p) => acc + p.tipMinor, 0);

  return {
    order,
    payments: ps,
    paid,
    tip,
    remaining: Math.max(0, order.totalMinor - paid),
  };
}
