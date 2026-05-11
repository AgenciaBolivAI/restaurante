import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";
import { getTenantSettings } from "@/server/services/tenant-settings";
import SettingsClient from "./settings-client";

export default async function SettingsPage({
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

  const tenant = await getTenantSettings(slug);
  if (!tenant) notFound();

  const t = await getTranslations("settings");
  const isOwner = ctx.membership.role === "owner";

  return (
    <main className="px-6 py-10 max-w-2xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        {!isOwner && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
            {t("ownerOnly")}
          </p>
        )}
      </header>

      <SettingsClient
        slug={slug}
        readOnly={!isOwner}
        tenant={{
          name: tenant.name,
          slug: tenant.slug,
          currency: tenant.currency,
          timezone: tenant.timezone,
          locale: tenant.locale,
          address: tenant.address ?? "",
          receiptFooter: tenant.receiptFooter ?? "",
          status: tenant.status,
          trialEndsAtIso: tenant.trialEndsAt?.toISOString() ?? null,
        }}
      />
    </main>
  );
}
