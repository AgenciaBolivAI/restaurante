import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const session = await effectiveAuth();
  if (!session) notFound();
  const ctx = await loadTenantForUser(slug, session.user.id);
  if (!ctx) notFound();

  const t = await getTranslations("admin");

  const trialDaysLeft =
    ctx.tenant.status === "trial" && ctx.tenant.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (ctx.tenant.trialEndsAt.getTime() - Date.now()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  return (
    <main className="px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">
          {t("welcome", { name: ctx.tenant.name })}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ctx.tenant.slug} · {ctx.tenant.currency}
        </p>
        {trialDaysLeft !== null && (
          <p className="text-sm mt-2 text-amber-600 dark:text-amber-400">
            {t("trialEndsIn", { days: trialDaysLeft })}
          </p>
        )}
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={t("ordersToday")} value="—" />
        <Stat label={t("salesToday")} value="—" />
        <Stat label={t("openTables")} value="—" />
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        {t("dashboardEmpty")}
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}
