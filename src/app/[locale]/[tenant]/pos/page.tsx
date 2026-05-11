import { setRequestLocale, getTranslations } from "next-intl/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, tables } from "@/db/schema";
import { requireTenantScope } from "@/server/repos/tenant-scope";
import PosGrid from "./pos-grid";

export default async function PosIndex({
  params,
}: {
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);
  const scope = await requireTenantScope(slug);

  const tableRows = await db
    .select()
    .from(tables)
    .where(
      and(
        eq(tables.tenantId, scope.tenantId),
        eq(tables.locationId, scope.locationId),
      ),
    )
    .orderBy(tables.number);

  // Open orders for any table (active states)
  const openOrders = await db
    .select({
      id: orders.id,
      tableId: orders.tableId,
      sequenceNo: orders.sequenceNo,
      openedAt: orders.openedAt,
      totalMinor: orders.totalMinor,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, scope.tenantId),
        sql`${orders.status} IN ('open','sent','preparing','ready','served')`,
      ),
    )
    .orderBy(desc(orders.openedAt));

  // To-go open orders (no tableId)
  const togoOpen = openOrders.filter((o) => o.tableId === null);

  // Map tableId -> open order
  const openByTable = new Map(
    openOrders.filter((o) => o.tableId).map((o) => [o.tableId as string, o]),
  );

  const t = await getTranslations("pos");

  return (
    <main className="p-4 max-w-3xl mx-auto w-full">
      <PosGrid
        slug={slug}
        labels={{
          tables: t("tables"),
          newToGo: t("newToGo"),
          togoOpen: t("togoOpen"),
          empty: t("noTables"),
          seats: t("seats"),
        }}
        currency={scope ? "USD" : "USD"}
        tables={tableRows.map((r) => ({
          id: r.id,
          number: r.number,
          seats: r.seats,
          area: r.area,
          openOrderId: openByTable.get(r.id)?.id ?? null,
          openSeq: openByTable.get(r.id)?.sequenceNo ?? null,
        }))}
        togoOpen={togoOpen.map((o) => ({
          id: o.id,
          sequenceNo: o.sequenceNo,
          openedAt: o.openedAt.toISOString(),
        }))}
      />
    </main>
  );
}
