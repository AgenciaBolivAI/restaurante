"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import type { SalesReport } from "@/server/services/reports";

type Preset = "today" | "week" | "month" | "year" | "custom";

const PRESETS: Preset[] = ["today", "week", "month", "year", "custom"];

function isoDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default function ReportsClient({
  slug,
  currency,
  locale,
  preset,
  from,
  to,
  report,
}: {
  slug: string;
  currency: string;
  locale: string;
  preset: Preset;
  from: string;
  to: string;
  report: SalesReport;
}) {
  const router = useRouter();
  const t = useTranslations("reports");
  const tPos = useTranslations("pos");

  const [customFrom, setCustomFrom] = useState(isoDate(from));
  const [customTo, setCustomTo] = useState(isoDate(to));

  function applyPreset(p: Preset) {
    if (p === "custom") {
      router.push(
        `/${slug}/admin/reports?preset=custom&from=${customFrom}&to=${customTo}T23:59:59`,
      );
    } else {
      router.push(`/${slug}/admin/reports?preset=${p}`);
    }
  }

  const csvHref = `/api/reports/${slug}/csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <div className="space-y-8">
      {/* Range controls */}
      <div className="flex flex-wrap items-end gap-2 p-4 rounded-lg border border-foreground/10">
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={
                "px-3 py-1.5 text-xs rounded border " +
                (preset === p
                  ? "bg-foreground text-background border-foreground"
                  : "border-foreground/15 hover:bg-foreground/5")
              }
            >
              {t(`presets.${p}` as "presets.today")}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("from")}</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-foreground/15 bg-transparent px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("to")}</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-foreground/15 bg-transparent px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={() => applyPreset("custom")}
              className="px-3 py-1.5 text-xs rounded bg-foreground text-background"
            >
              {t("apply")}
            </button>
          </div>
        )}
        <div className="ml-auto">
          <a
            href={csvHref}
            className="px-3 py-1.5 text-xs rounded border border-foreground/15 hover:bg-foreground/5 inline-block"
          >
            ⬇ {t("exportCsv")}
          </a>
        </div>
      </div>

      {/* Top-line totals */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label={t("orders")} value={report.totals.orders.toString()} />
        <Card
          label={t("gross")}
          value={formatMoney(report.totals.grossMinor, currency, locale)}
        />
        <Card
          label={t("tip")}
          value={formatMoney(report.totals.tipMinor, currency, locale)}
        />
        <Card
          label={t("net")}
          value={formatMoney(report.totals.netMinor, currency, locale)}
          accent
        />
      </section>

      {/* Two columns: methods + categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title={t("byMethod")}>
          {report.byMethod.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1">{t("method")}</th>
                  <th className="text-right py-1">{t("count")}</th>
                  <th className="text-right py-1">{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {report.byMethod.map((r) => (
                  <tr key={r.method} className="border-t border-foreground/10">
                    <td className="py-1.5">{tPos(`methods.${r.method}`)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {r.countPayments}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatMoney(r.amountMinor + r.tipMinor, currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t("byCategory")}>
          {report.byCategory.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1">{t("category")}</th>
                  <th className="text-right py-1">{t("qty")}</th>
                  <th className="text-right py-1">{t("revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((r) => (
                  <tr
                    key={r.categoryId ?? "_"}
                    className="border-t border-foreground/10"
                  >
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.qty}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatMoney(r.revenueMinor, currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {/* Top items */}
      <Section title={t("topItems")}>
        {report.topItems.length === 0 ? (
          <Empty />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">{t("item")}</th>
                <th className="text-right py-1">{t("qty")}</th>
                <th className="text-right py-1">{t("revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {report.topItems.map((r, i) => (
                <tr
                  key={r.menuItemId ?? r.name}
                  className="border-t border-foreground/10"
                >
                  <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.qty}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatMoney(r.revenueMinor, currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Leaderboard */}
      <Section title={t("leaderboard")}>
        {report.leaderboard.length === 0 ? (
          <Empty />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">{t("waiter")}</th>
                <th className="text-right py-1">{t("ordersServed")}</th>
                <th className="text-right py-1">{t("revenue")}</th>
                <th className="text-right py-1">{t("tip")}</th>
              </tr>
            </thead>
            <tbody>
              {report.leaderboard.map((r, i) => (
                <tr key={r.userId} className="border-t border-foreground/10">
                  <td className="py-1.5 text-muted-foreground">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </td>
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.primaryOrders}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatMoney(r.revenueMinor, currency, locale)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatMoney(r.tipMinor, currency, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Two more columns: hours + variance/voids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title={t("hoursWorked")}>
          {report.hoursWorked.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1">{t("employee")}</th>
                  <th className="text-right py-1">{t("sessions")}</th>
                  <th className="text-right py-1">{t("hours")}</th>
                </tr>
              </thead>
              <tbody>
                {report.hoursWorked.map((r) => (
                  <tr key={r.userId} className="border-t border-foreground/10">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {r.sessions}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {fmtMin(r.minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t("operations")}>
          <ul className="text-sm space-y-2">
            <li className="flex justify-between">
              <span>{t("voidedItems")}</span>
              <span className="font-mono tabular-nums">
                {report.totals.voidedItems}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t("closedShifts")}</span>
              <span className="font-mono tabular-nums">
                {report.cashVariance.closedShifts}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t("totalVariance")}</span>
              <span
                className={
                  "font-mono tabular-nums " +
                  (report.cashVariance.totalVarianceMinor === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : report.cashVariance.totalVarianceMinor < 0
                      ? "text-red-500"
                      : "text-amber-600 dark:text-amber-400")
                }
              >
                {report.cashVariance.totalVarianceMinor > 0 ? "+" : ""}
                {formatMoney(
                  report.cashVariance.totalVarianceMinor,
                  currency,
                  locale,
                )}
              </span>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 " +
        (accent
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-foreground/10")
      }
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold mt-1 font-mono tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
        {title}
      </h2>
      <div className="rounded-lg border border-foreground/10 p-4">{children}</div>
    </section>
  );
}

function Empty() {
  const t = useTranslations("reports");
  return <p className="text-sm text-muted-foreground">{t("noData")}</p>;
}
