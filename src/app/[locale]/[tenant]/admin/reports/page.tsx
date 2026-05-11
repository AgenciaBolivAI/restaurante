import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";
import { getSalesReport } from "@/server/services/reports";
import ReportsClient from "./reports-client";

type Preset = "today" | "week" | "month" | "year" | "custom";

function rangeFor(
  preset: Preset,
  fromParam: string | undefined,
  toParam: string | undefined,
): { from: Date; to: Date; preset: Preset } {
  const now = new Date();
  if (preset === "custom" && fromParam && toParam) {
    return {
      preset,
      from: new Date(fromParam),
      to: new Date(toParam),
    };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === "today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { preset, from: start, to: end };
  }
  if (preset === "week") {
    const day = (start.getDay() + 6) % 7; // ISO: Monday = 0
    start.setDate(start.getDate() - day);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { preset, from: start, to: end };
  }
  if (preset === "month") {
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { preset, from: start, to: end };
  }
  // year
  start.setMonth(0, 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return { preset: "year", from: start, to: end };
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; tenant: string }>;
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { locale, tenant: slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = await effectiveAuth();
  if (!session) notFound();
  const ctx = await loadTenantForUser(slug, session.user.id);
  if (!ctx) notFound();

  const presetIn = (sp.preset as Preset) || "today";
  const valid: Preset[] = ["today", "week", "month", "year", "custom"];
  const preset = valid.includes(presetIn) ? presetIn : "today";

  const { from, to } = rangeFor(preset, sp.from, sp.to);
  const report = await getSalesReport(slug, from.toISOString(), to.toISOString());

  const t = await getTranslations("reports");

  return (
    <main className="px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      <ReportsClient
        slug={slug}
        currency={ctx.tenant.currency}
        locale={locale}
        preset={preset}
        from={from.toISOString()}
        to={to.toISOString()}
        report={report}
      />
    </main>
  );
}
