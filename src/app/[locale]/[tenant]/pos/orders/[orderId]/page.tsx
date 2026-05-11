import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { menuItems, menuCategories, tables, users } from "@/db/schema";
import { getOrderForPos } from "@/server/services/orders";
import { getOrderPaymentSummary } from "@/server/services/payments";
import { requireTenantScope } from "@/server/repos/tenant-scope";
import { loadTenantForUser } from "@/server/repos/tenant";
import { effectiveAuth } from "@/server/auth/impersonation";
import OrderDetail from "./order-detail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; tenant: string; orderId: string }>;
}) {
  const { locale, tenant: slug, orderId } = await params;
  setRequestLocale(locale);

  const session = await effectiveAuth();
  if (!session) notFound();
  const tenantCtx = await loadTenantForUser(slug, session.user.id);
  if (!tenantCtx) notFound();

  const data = await getOrderForPos(slug, orderId);
  if (!data) notFound();

  const scope = await requireTenantScope(slug);
  const paySummary = await getOrderPaymentSummary(slug, orderId);

  const [menu, categories, allUsers, tableRow] = await Promise.all([
    db
      .select()
      .from(menuItems)
      .where(
        and(eq(menuItems.tenantId, scope.tenantId), eq(menuItems.archived, false)),
      )
      .orderBy(menuItems.name),
    db
      .select()
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.tenantId, scope.tenantId),
          eq(menuCategories.archived, false),
        ),
      )
      .orderBy(menuCategories.sortOrder, menuCategories.name),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
    data.order.tableId
      ? db.select().from(tables).where(eq(tables.id, data.order.tableId)).limit(1)
      : Promise.resolve([]),
  ]);

  const userMap = new Map(allUsers.map((u) => [u.id, u.name ?? u.email]));
  const t = await getTranslations("pos");
  const tCommon = await getTranslations("common");

  const tableNumber = tableRow[0]?.number ?? null;

  return (
    <main className="p-4 max-w-3xl mx-auto w-full">
      <OrderDetail
        slug={slug}
        currency={tenantCtx.tenant.currency}
        locale={locale}
        currentUserId={session.user.id}
        labels={{
          orderNumber: t("orderNumber"),
          tableLabel: t("table"),
          togo: "TO-GO",
          openedBy: t("openedBy"),
          assignees: t("assignees"),
          itemsTitle: t("itemsTitle"),
          noItems: t("noItems"),
          addItem: t("addItem"),
          search: t("search"),
          send: t("sendToStations"),
          back: t("backToTables"),
          remove: tCommon("delete"),
          notes: t("notes"),
          qty: t("qty"),
          pay: t("pay"),
          payTitle: t("payTitle"),
          method: t("method"),
          methods: {
            cash: t("methods.cash"),
            card: t("methods.card"),
            transfer: t("methods.transfer"),
            other: t("methods.other"),
          },
          amount: t("amount"),
          tip: t("tip"),
          remaining: t("remaining"),
          paid: t("paid"),
          confirm: t("confirm"),
          printReceipt: t("printReceipt"),
          paidStatus: t("paidStatus"),
          voidLabel: t("voidLabel"),
          voidReason: t("voidReason"),
          status: {
            pending: t("status.pending"),
            preparing: t("status.preparing"),
            ready: t("status.ready"),
            served: t("status.served"),
            void: t("status.void"),
          },
        }}
        order={{
          id: data.order.id,
          status: data.order.status,
          sequenceNo: data.order.sequenceNo,
          orderType: data.order.orderType,
          openedByUserId: data.order.openedByUserId,
          openedByName: userMap.get(data.order.openedByUserId) ?? null,
          totalMinor: data.order.totalMinor,
          tableNumber,
        }}
        payment={
          paySummary
            ? {
                paid: paySummary.paid,
                tip: paySummary.tip,
                remaining: paySummary.remaining,
                count: paySummary.payments.filter((p) => !p.refundedAt).length,
              }
            : { paid: 0, tip: 0, remaining: data.order.totalMinor, count: 0 }
        }
        canVoid={["owner", "manager"].includes(scope.role)}
        items={data.items.map((i) => ({
          id: i.id,
          name: i.nameSnapshot,
          qty: i.qty,
          unitPriceMinor: i.unitPriceMinor,
          notes: i.notes,
          station: i.station,
          kdsStatus: i.kdsStatus,
          addedByUserId: i.addedByUserId,
          addedByName: userMap.get(i.addedByUserId) ?? null,
        }))}
        assignees={data.assignees.map((a) => ({
          userId: a.userId,
          name: userMap.get(a.userId) ?? "?",
          isPrimary: a.isPrimary,
        }))}
        menu={menu.map((m) => ({
          id: m.id,
          name: m.name,
          categoryId: m.categoryId,
          priceMinor: m.priceMinor,
          station: m.station,
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
