"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orderItems, orders, tables } from "@/db/schema";
import { requireTenantScope } from "@/server/repos/tenant-scope";

export type Station = "kitchen" | "bar";

export type KdsItem = {
  id: string;
  name: string;
  qty: number;
  notes: string | null;
  station: "kitchen" | "bar" | "both" | "none";
  kdsStatus: "pending" | "preparing" | "ready" | "served" | "void";
  firedAt: string | null;
  readyAt: string | null;
};

export type KdsTicket = {
  orderId: string;
  sequenceNo: number;
  orderType: "dine_in" | "to_go" | "delivery";
  tableNumber: number | null;
  openedAt: string;
  items: KdsItem[];
  oldestFiredAt: string | null;
};

export async function listStationTickets(
  slug: string,
  station: Station,
): Promise<KdsTicket[]> {
  const scope = await requireTenantScope(slug);

  // station=both routes to both. station=none routes to neither.
  const stationFilter = sql`${orderItems.station} IN (${station}, 'both')`;

  const rows = await db
    .select({
      orderId: orders.id,
      sequenceNo: orders.sequenceNo,
      orderType: orders.orderType,
      orderOpenedAt: orders.openedAt,
      tableNumber: tables.number,
      itemId: orderItems.id,
      itemName: orderItems.nameSnapshot,
      qty: orderItems.qty,
      notes: orderItems.notes,
      station: orderItems.station,
      kdsStatus: orderItems.kdsStatus,
      firedAt: orderItems.firedAt,
      readyAt: orderItems.readyAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(tables, eq(tables.id, orders.tableId))
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        stationFilter,
        inArray(orderItems.kdsStatus, ["preparing", "ready"]),
      ),
    )
    .orderBy(asc(orders.openedAt), asc(orderItems.addedAt));

  // Group by order
  const byOrder = new Map<string, KdsTicket>();
  for (const r of rows) {
    let t = byOrder.get(r.orderId);
    if (!t) {
      t = {
        orderId: r.orderId,
        sequenceNo: r.sequenceNo,
        orderType: r.orderType,
        tableNumber: r.tableNumber ?? null,
        openedAt: r.orderOpenedAt.toISOString(),
        items: [],
        oldestFiredAt: null,
      };
      byOrder.set(r.orderId, t);
    }
    t.items.push({
      id: r.itemId,
      name: r.itemName,
      qty: r.qty,
      notes: r.notes,
      station: r.station,
      kdsStatus: r.kdsStatus,
      firedAt: r.firedAt?.toISOString() ?? null,
      readyAt: r.readyAt?.toISOString() ?? null,
    });
    if (r.firedAt && (!t.oldestFiredAt || r.firedAt.toISOString() < t.oldestFiredAt)) {
      t.oldestFiredAt = r.firedAt.toISOString();
    }
  }

  return Array.from(byOrder.values()).sort((a, b) => {
    const ax = a.oldestFiredAt ?? a.openedAt;
    const bx = b.oldestFiredAt ?? b.openedAt;
    return ax.localeCompare(bx);
  });
}

export async function markItemReadyAction(
  slug: string,
  itemId: string,
) {
  const scope = await requireTenantScope(slug);

  await db.transaction(async (tx) => {
    // Confirm item belongs to tenant
    const [it] = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        kdsStatus: orderItems.kdsStatus,
        tenantId: orders.tenantId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.id, itemId))
      .limit(1);
    if (!it || it.tenantId !== scope.tenantId) return;
    if (it.kdsStatus !== "preparing") return;

    await tx
      .update(orderItems)
      .set({ kdsStatus: "ready", readyAt: new Date() })
      .where(eq(orderItems.id, itemId));

    // If all items in the order are 'ready' or 'served', flip order status to 'ready'
    const remaining = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, it.orderId),
          inArray(orderItems.kdsStatus, ["pending", "preparing"]),
        ),
      )
      .limit(1);
    if (remaining.length === 0) {
      await tx
        .update(orders)
        .set({ status: "ready" })
        .where(eq(orders.id, it.orderId));
    }
  });

  revalidatePath(`/[locale]/${slug}/kds/kitchen`, "page");
  revalidatePath(`/[locale]/${slug}/kds/bar`, "page");
  revalidatePath(`/[locale]/${slug}/pos`, "page");
}

/** Bumps a ready item back to preparing (in case kitchen tapped by mistake). */
export async function markItemUnreadyAction(slug: string, itemId: string) {
  const scope = await requireTenantScope(slug);
  await db.transaction(async (tx) => {
    const [it] = await tx
      .select({
        kdsStatus: orderItems.kdsStatus,
        tenantId: orders.tenantId,
        orderId: orderItems.orderId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.id, itemId))
      .limit(1);
    if (!it || it.tenantId !== scope.tenantId) return;
    if (it.kdsStatus !== "ready") return;

    await tx
      .update(orderItems)
      .set({ kdsStatus: "preparing", readyAt: null })
      .where(eq(orderItems.id, itemId));

    await tx
      .update(orders)
      .set({ status: "preparing" })
      .where(eq(orders.id, it.orderId));
  });
  revalidatePath(`/[locale]/${slug}/kds/kitchen`, "page");
  revalidatePath(`/[locale]/${slug}/kds/bar`, "page");
}
