"use server";

import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  orders,
  orderItems,
  orderAssignees,
  menuItems,
  tables,
  taxRates,
} from "@/db/schema";
import { requireTenantScope } from "@/server/repos/tenant-scope";
import { perUnitTax } from "@/lib/tax";
import type { ActionState } from "./types";

const openOrderSchema = z.object({
  tableId: z.string().uuid().optional().nullable(),
  orderType: z.enum(["dine_in", "to_go"]).default("dine_in"),
});

const addItemSchema = z.object({
  menuItemId: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(50).default(1),
  notes: z.string().trim().max(200).optional().nullable(),
});

/** Returns the open order on a given table, or null. */
export async function findOpenOrderForTable(
  tenantId: string,
  tableId: string,
) {
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.tableId, tableId),
        sql`${orders.status} IN ('open','sent','preparing','ready','served')`,
      ),
    )
    .orderBy(desc(orders.openedAt))
    .limit(1);
  return row ?? null;
}

/** Computes next per-day sequence number for the tenant. */
async function nextSequenceNo(tenantId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${orders.sequenceNo}), 0)` })
    .from(orders)
    .where(
      and(eq(orders.tenantId, tenantId), gte(orders.openedAt, startOfDay)),
    );
  return (row?.max ?? 0) + 1;
}

/** Opens a new order or returns existing open order on a table. Adds caller as primary assignee. */
export async function openOrUseTableOrder(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);

  const parsed = openOrderSchema.safeParse({
    tableId: formData.get("tableId") || null,
    orderType: formData.get("orderType") || "dine_in",
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  let orderId: string | null = null;

  if (parsed.data.tableId && parsed.data.orderType === "dine_in") {
    const existing = await findOpenOrderForTable(scope.tenantId, parsed.data.tableId);
    if (existing) {
      orderId = existing.id;
      // Add caller as non-primary assignee if not already on it
      await db
        .insert(orderAssignees)
        .values({
          orderId: existing.id,
          userId: scope.userId,
          isPrimary: false,
        })
        .onConflictDoNothing();
    }
  }

  if (!orderId) {
    const sequenceNo = await nextSequenceNo(scope.tenantId);
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(orders)
        .values({
          tenantId: scope.tenantId,
          locationId: scope.locationId,
          tableId: parsed.data.orderType === "to_go" ? null : parsed.data.tableId ?? null,
          orderType: parsed.data.orderType,
          status: "open",
          sequenceNo,
          openedByUserId: scope.userId,
        })
        .returning({ id: orders.id });
      orderId = created.id;

      await tx.insert(orderAssignees).values({
        orderId: created.id,
        userId: scope.userId,
        isPrimary: true,
      });

      if (parsed.data.tableId && parsed.data.orderType === "dine_in") {
        await tx
          .update(tables)
          .set({ status: "occupied" })
          .where(
            and(
              eq(tables.tenantId, scope.tenantId),
              eq(tables.id, parsed.data.tableId),
            ),
          );
      }
    });
  }

  revalidatePath(`/[locale]/${slug}/pos`, "page");
  redirect(`/${scope.tenantSlug}/pos/orders/${orderId}`);
}

export async function getOrderForPos(slug: string, orderId: string) {
  const scope = await requireTenantScope(slug);

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, scope.tenantId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.addedAt);

  const assignees = await db
    .select()
    .from(orderAssignees)
    .where(eq(orderAssignees.orderId, orderId));

  return { order, items, assignees, scope };
}

export async function addItemAction(
  slug: string,
  orderId: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);

  const parsed = addItemSchema.safeParse({
    menuItemId: formData.get("menuItemId"),
    qty: formData.get("qty") || 1,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  // Confirm order belongs to tenant + is still open
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.tenantId, scope.tenantId), eq(orders.id, orderId)))
    .limit(1);
  if (!order) return { status: "error", message: "Order not found" };
  if (order.status === "paid" || order.status === "void") {
    return { status: "error", message: "Order is closed" };
  }

  const [itemRow] = await db
    .select({
      item: menuItems,
      taxBps: taxRates.bps,
      taxInclusive: taxRates.inclusive,
    })
    .from(menuItems)
    .leftJoin(taxRates, eq(taxRates.id, menuItems.taxRateId))
    .where(
      and(
        eq(menuItems.tenantId, scope.tenantId),
        eq(menuItems.id, parsed.data.menuItemId),
      ),
    )
    .limit(1);
  if (!itemRow) return { status: "error", message: "Menu item not found" };
  const item = itemRow.item;

  // Snapshot tax at insert time so future tax-rate edits don't change historical totals.
  const lineTax =
    parsed.data.qty *
    perUnitTax(item.priceMinor, itemRow.taxBps ?? 0, itemRow.taxInclusive ?? false);

  await db.transaction(async (tx) => {
    await tx.insert(orderItems).values({
      orderId,
      menuItemId: item.id,
      nameSnapshot: item.name,
      qty: parsed.data.qty,
      unitPriceMinor: item.priceMinor,
      taxMinor: lineTax,
      modifiersSnapshot: [],
      notes: parsed.data.notes || null,
      station: item.station,
      kdsStatus: "pending",
      addedByUserId: scope.userId,
    });

    await tx
      .insert(orderAssignees)
      .values({ orderId, userId: scope.userId, isPrimary: false })
      .onConflictDoNothing();

    await recalcOrderTotalsTx(tx, orderId);
  });

  revalidatePath(`/[locale]/${slug}/pos/orders/${orderId}`, "page");
  return { status: "ok" };
}

export async function removeItemAction(
  slug: string,
  orderId: string,
  itemId: string,
) {
  const scope = await requireTenantScope(slug);

  // Only allow removing items still in 'pending' (not yet sent to KDS)
  await db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, itemId))
      .limit(1);
    if (!item || item.orderId !== orderId) return;
    if (item.kdsStatus !== "pending") return;

    const [order] = await tx
      .select({ tenantId: orders.tenantId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order || order.tenantId !== scope.tenantId) return;

    await tx.delete(orderItems).where(eq(orderItems.id, itemId));
    await recalcOrderTotalsTx(tx, orderId);
  });

  revalidatePath(`/[locale]/${slug}/pos/orders/${orderId}`, "page");
}

/** Marks all 'pending' items as 'preparing' (= sent to station). */
export async function sendToStationsAction(slug: string, orderId: string) {
  const scope = await requireTenantScope(slug);

  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(eq(orders.tenantId, scope.tenantId), eq(orders.id, orderId)),
      )
      .limit(1);
    if (!order) return;

    const now = new Date();
    await tx
      .update(orderItems)
      .set({ kdsStatus: "preparing", firedAt: now })
      .where(
        and(eq(orderItems.orderId, orderId), eq(orderItems.kdsStatus, "pending")),
      );

    if (order.status === "open") {
      await tx
        .update(orders)
        .set({ status: "sent" })
        .where(eq(orders.id, orderId));
    }
  });

  revalidatePath(`/[locale]/${slug}/pos/orders/${orderId}`, "page");
}

type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

async function recalcOrderTotalsTx(tx: DbOrTx, orderId: string) {
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
}
