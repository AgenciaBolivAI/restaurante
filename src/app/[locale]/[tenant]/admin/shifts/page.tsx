import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";
import { requireTenantScope } from "@/server/repos/tenant-scope";
import { getCurrentOpenShift, listShifts } from "@/server/services/shifts";
import ShiftsClient from "./shifts-client";

export default async function ShiftsPage({
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
  const scope = await requireTenantScope(slug);

  const open = await getCurrentOpenShift(scope.tenantId, scope.locationId);
  const history = await listShifts(slug);

  const t = await getTranslations("shifts");

  return (
    <main className="px-6 py-10 max-w-4xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      <ShiftsClient
        slug={slug}
        currency={ctx.tenant.currency}
        locale={locale}
        open={
          open
            ? {
                id: open.id,
                openedAt: open.openedAt.toISOString(),
                openingFloatMinor: open.openingFloatMinor,
              }
            : null
        }
        history={history.map((s) => ({
          id: s.id,
          openedAt: s.openedAt.toISOString(),
          closedAt: s.closedAt?.toISOString() ?? null,
          openingFloatMinor: s.openingFloatMinor,
          closingCountMinor: s.closingCountMinor,
          expectedMinor: s.expectedMinor,
          varianceMinor: s.varianceMinor,
        }))}
      />
    </main>
  );
}
