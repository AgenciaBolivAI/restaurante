import { getSalesReport } from "@/server/services/reports";

export const runtime = "nodejs";

function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cols: Array<string | number | null | undefined>): string {
  return cols.map(csvField).join(",") + "\n";
}

function moneyCol(minor: number): string {
  return (minor / 100).toFixed(2);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return new Response("Missing from/to", { status: 400 });
  }

  let report;
  try {
    report = await getSalesReport(slug, from, to);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "UNAUTHENTICATED") return new Response("Unauthorized", { status: 401 });
    if (msg === "FORBIDDEN") return new Response("Forbidden", { status: 403 });
    return new Response("Bad request", { status: 400 });
  }

  let csv = "";
  csv += row("Sales Report");
  csv += row("From", report.range.from);
  csv += row("To", report.range.to);
  csv += "\n";

  csv += row("Totals");
  csv += row("orders", report.totals.orders);
  csv += row("gross", moneyCol(report.totals.grossMinor));
  csv += row("tax", moneyCol(report.totals.taxMinor));
  csv += row("tip", moneyCol(report.totals.tipMinor));
  csv += row("net", moneyCol(report.totals.netMinor));
  csv += row("voided_items", report.totals.voidedItems);
  csv += "\n";

  csv += row("Payments by method");
  csv += row("method", "count", "amount", "tip");
  for (const r of report.byMethod) {
    csv += row(r.method, r.countPayments, moneyCol(r.amountMinor), moneyCol(r.tipMinor));
  }
  csv += "\n";

  csv += row("Top items");
  csv += row("name", "qty", "revenue");
  for (const r of report.topItems) {
    csv += row(r.name, r.qty, moneyCol(r.revenueMinor));
  }
  csv += "\n";

  csv += row("By category");
  csv += row("category", "qty", "revenue");
  for (const r of report.byCategory) {
    csv += row(r.name, r.qty, moneyCol(r.revenueMinor));
  }
  csv += "\n";

  csv += row("Waitress leaderboard");
  csv += row("waiter", "primary_orders", "revenue", "tip");
  for (const r of report.leaderboard) {
    csv += row(r.name, r.primaryOrders, moneyCol(r.revenueMinor), moneyCol(r.tipMinor));
  }
  csv += "\n";

  csv += row("Hours worked");
  csv += row("employee", "sessions", "minutes", "hours");
  for (const r of report.hoursWorked) {
    csv += row(r.name, r.sessions, r.minutes, (r.minutes / 60).toFixed(2));
  }
  csv += "\n";

  csv += row("Cash variance");
  csv += row("closed_shifts", report.cashVariance.closedShifts);
  csv += row("total_variance", moneyCol(report.cashVariance.totalVarianceMinor));

  const fname = `report_${from.slice(0, 10)}_to_${to.slice(0, 10)}.csv`;
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
