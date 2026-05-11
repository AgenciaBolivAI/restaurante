"use server";

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  orders,
  orderItems,
  payments,
  orderAssignees,
  users,
  cashDrawerShifts,
  timeClockEntries,
  menuItems,
  menuCategories,
} from "@/db/schema";
import { requireTenantScope } from "@/server/repos/tenant-scope";

export type SalesReport = {
  range: { from: string; to: string };
  totals: {
    orders: number;
    grossMinor: number; // sum of order subtotals (excludes voided items)
    taxMinor: number;
    tipMinor: number;
    netMinor: number; // gross + tax + tip = total taken
    voidedItems: number;
  };
  byMethod: Array<{
    method: "cash" | "card" | "transfer" | "other";
    countPayments: number;
    amountMinor: number;
    tipMinor: number;
  }>;
  topItems: Array<{
    menuItemId: string | null;
    name: string;
    qty: number;
    revenueMinor: number;
  }>;
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    qty: number;
    revenueMinor: number;
  }>;
  leaderboard: Array<{
    userId: string;
    name: string;
    primaryOrders: number;
    revenueMinor: number; // primary-attributed revenue
    tipMinor: number;
  }>;
  hoursWorked: Array<{
    userId: string;
    name: string;
    sessions: number;
    minutes: number;
  }>;
  cashVariance: {
    closedShifts: number;
    totalVarianceMinor: number;
  };
};

function parseRange(fromIso: string, toIso: string): { from: Date; to: Date } {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    throw new Error("Invalid date range");
  }
  return { from, to };
}

export async function getSalesReport(
  slug: string,
  fromIso: string,
  toIso: string,
): Promise<SalesReport> {
  const scope = await requireTenantScope(slug);
  const { from, to } = parseRange(fromIso, toIso);

  // 1. Order totals (only paid orders count for revenue)
  const [orderTotals] = await db
    .select({
      orders: sql<number>`COUNT(*)::int`,
      gross: sql<number>`COALESCE(SUM(${orders.subtotalMinor}), 0)::int`,
      tax: sql<number>`COALESCE(SUM(${orders.taxMinor}), 0)::int`,
      tip: sql<number>`COALESCE(SUM(${orders.tipMinor}), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        eq(orders.status, "paid"),
        gte(orders.openedAt, from),
        lt(orders.openedAt, to),
      ),
    );

  // 2. Voided items count in window
  const [voidAgg] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        eq(orderItems.kdsStatus, "void"),
        gte(orders.openedAt, from),
        lt(orders.openedAt, to),
      ),
    );

  // 3. Payments by method
  const byMethodRows = await db
    .select({
      method: payments.method,
      n: sql<number>`COUNT(*)::int`,
      amount: sql<number>`COALESCE(SUM(${payments.amountMinor}), 0)::int`,
      tip: sql<number>`COALESCE(SUM(${payments.tipMinor}), 0)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, scope.tenantId),
        gte(payments.paidAt, from),
        lt(payments.paidAt, to),
        sql`${payments.refundedAt} IS NULL`,
      ),
    )
    .groupBy(payments.method);

  // 4. Top items (only non-voided in paid orders)
  const topItemsRows = await db
    .select({
      menuItemId: orderItems.menuItemId,
      name: orderItems.nameSnapshot,
      qty: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)::int`,
      revenue: sql<number>`COALESCE(SUM(${orderItems.qty} * ${orderItems.unitPriceMinor}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        eq(orders.status, "paid"),
        sql`${orderItems.kdsStatus} != 'void'`,
        gte(orders.openedAt, from),
        lt(orders.openedAt, to),
      ),
    )
    .groupBy(orderItems.menuItemId, orderItems.nameSnapshot)
    .orderBy(sql`SUM(${orderItems.qty} * ${orderItems.unitPriceMinor}) DESC`)
    .limit(10);

  // 5. By category
  const byCategoryRows = await db
    .select({
      categoryId: menuItems.categoryId,
      name: menuCategories.name,
      qty: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)::int`,
      revenue: sql<number>`COALESCE(SUM(${orderItems.qty} * ${orderItems.unitPriceMinor}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .leftJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        eq(orders.status, "paid"),
        sql`${orderItems.kdsStatus} != 'void'`,
        gte(orders.openedAt, from),
        lt(orders.openedAt, to),
      ),
    )
    .groupBy(menuItems.categoryId, menuCategories.name)
    .orderBy(sql`SUM(${orderItems.qty} * ${orderItems.unitPriceMinor}) DESC`);

  // 6. Waitress leaderboard (primary-assignee gets the credit)
  const leaderboardRows = await db
    .select({
      userId: orderAssignees.userId,
      name: sql<string>`COALESCE(${users.name}, ${users.email})`,
      primaryOrders: sql<number>`COUNT(*)::int`,
      revenue: sql<number>`COALESCE(SUM(${orders.subtotalMinor}), 0)::int`,
      tip: sql<number>`COALESCE(SUM(${orders.tipMinor}), 0)::int`,
    })
    .from(orderAssignees)
    .innerJoin(orders, eq(orders.id, orderAssignees.orderId))
    .innerJoin(users, eq(users.id, orderAssignees.userId))
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        eq(orders.status, "paid"),
        eq(orderAssignees.isPrimary, true),
        gte(orders.openedAt, from),
        lt(orders.openedAt, to),
      ),
    )
    .groupBy(orderAssignees.userId, users.name, users.email)
    .orderBy(sql`SUM(${orders.subtotalMinor}) DESC`);

  // 7. Hours worked: clamp clockOut to range end if still open
  const clockedRows = await db
    .select({
      userId: timeClockEntries.userId,
      name: sql<string>`COALESCE(${users.name}, ${users.email})`,
      sessions: sql<number>`COUNT(*)::int`,
      minutes: sql<number>`COALESCE(
        SUM(EXTRACT(EPOCH FROM (
          LEAST(COALESCE(${timeClockEntries.clockOut}, ${to.toISOString()}::timestamptz), ${to.toISOString()}::timestamptz)
          - GREATEST(${timeClockEntries.clockIn}, ${from.toISOString()}::timestamptz)
        )) / 60), 0
      )::int`,
    })
    .from(timeClockEntries)
    .innerJoin(users, eq(users.id, timeClockEntries.userId))
    .where(
      and(
        eq(timeClockEntries.tenantId, scope.tenantId),
        // include any entry that overlaps the window
        sql`${timeClockEntries.clockIn} < ${to.toISOString()}::timestamptz`,
        sql`COALESCE(${timeClockEntries.clockOut}, ${to.toISOString()}::timestamptz) > ${from.toISOString()}::timestamptz`,
      ),
    )
    .groupBy(timeClockEntries.userId, users.name, users.email)
    .orderBy(sql`SUM(EXTRACT(EPOCH FROM (
      LEAST(COALESCE(${timeClockEntries.clockOut}, ${to.toISOString()}::timestamptz), ${to.toISOString()}::timestamptz)
      - GREATEST(${timeClockEntries.clockIn}, ${from.toISOString()}::timestamptz)
    ))) DESC`);

  // 8. Cash drawer variance for closed shifts in window
  const [varianceAgg] = await db
    .select({
      closedShifts: sql<number>`COUNT(*)::int`,
      totalVariance: sql<number>`COALESCE(SUM(${cashDrawerShifts.varianceMinor}), 0)::int`,
    })
    .from(cashDrawerShifts)
    .where(
      and(
        eq(cashDrawerShifts.tenantId, scope.tenantId),
        sql`${cashDrawerShifts.closedAt} IS NOT NULL`,
        gte(cashDrawerShifts.closedAt, from),
        lt(cashDrawerShifts.closedAt, to),
      ),
    );

  const grossMinor = orderTotals?.gross ?? 0;
  const taxMinor = orderTotals?.tax ?? 0;
  const tipMinor = orderTotals?.tip ?? 0;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      orders: orderTotals?.orders ?? 0,
      grossMinor,
      taxMinor,
      tipMinor,
      netMinor: grossMinor + taxMinor + tipMinor,
      voidedItems: voidAgg?.n ?? 0,
    },
    byMethod: byMethodRows.map((r) => ({
      method: r.method,
      countPayments: r.n,
      amountMinor: r.amount,
      tipMinor: r.tip,
    })),
    topItems: topItemsRows.map((r) => ({
      menuItemId: r.menuItemId,
      name: r.name,
      qty: r.qty,
      revenueMinor: r.revenue,
    })),
    byCategory: byCategoryRows.map((r) => ({
      categoryId: r.categoryId,
      name: r.name ?? "—",
      qty: r.qty,
      revenueMinor: r.revenue,
    })),
    leaderboard: leaderboardRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      primaryOrders: r.primaryOrders,
      revenueMinor: r.revenue,
      tipMinor: r.tip,
    })),
    hoursWorked: clockedRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      sessions: r.sessions,
      minutes: r.minutes,
    })),
    cashVariance: {
      closedShifts: varianceAgg?.closedShifts ?? 0,
      totalVarianceMinor: varianceAgg?.totalVariance ?? 0,
    },
  };
}
