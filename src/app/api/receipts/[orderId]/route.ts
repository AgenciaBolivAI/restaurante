import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq } from "drizzle-orm";
import { effectiveAuth } from "@/server/auth/impersonation";
import { db } from "@/db/client";
import {
  orders,
  orderItems,
  payments,
  tenants,
  tables,
  memberships,
} from "@/db/schema";
import { Receipt, type ReceiptProps } from "@/server/receipts/Receipt";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await effectiveAuth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { orderId } = await params;

  const [row] = await db
    .select({
      order: orders,
      tenant: tenants,
      tableNumber: tables.number,
    })
    .from(orders)
    .innerJoin(tenants, eq(tenants.id, orders.tenantId))
    .leftJoin(tables, eq(tables.id, orders.tableId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  // Verify membership
  const [member] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, row.tenant.id),
        eq(memberships.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!member) return new Response("Forbidden", { status: 403 });

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.addedAt);

  const ps = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(payments.paidAt);

  const props: ReceiptProps = {
    tenantName: row.tenant.name,
    tenantAddress: row.tenant.address ?? null,
    currency: row.tenant.currency,
    locale: row.tenant.locale,
    orderSequenceNo: row.order.sequenceNo,
    orderType: row.order.orderType,
    tableNumber: row.tableNumber ?? null,
    openedAt: row.order.openedAt,
    closedAt: row.order.closedAt,
    items: items
      .filter((i) => i.kdsStatus !== "void")
      .map((i) => ({
        qty: i.qty,
        name: i.nameSnapshot,
        unitPriceMinor: i.unitPriceMinor,
        modifiers: (i.modifiersSnapshot ?? []).map((m) => m.name),
        notes: i.notes,
      })),
    subtotalMinor: row.order.subtotalMinor,
    taxMinor: row.order.taxMinor,
    tipMinor: row.order.tipMinor,
    totalMinor: row.order.totalMinor,
    payments: ps
      .filter((p) => p.refundedAt === null)
      .map((p) => ({
        method: p.method,
        amountMinor: p.amountMinor,
        tipMinor: p.tipMinor,
      })),
    footer: row.tenant.receiptFooter ?? "¡Gracias por su visita!",
  };

  const buffer = await renderToBuffer(Receipt(props));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${row.order.sequenceNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
