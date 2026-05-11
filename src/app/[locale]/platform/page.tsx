import { setRequestLocale, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import {
  listAllPlans,
  listAllTenants,
} from "@/server/platform/platform";
import PlatformClient from "./platform-client";

export default async function PlatformPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const [tenants, plans, session] = await Promise.all([
    listAllTenants(sp.q),
    listAllPlans(),
    auth(),
  ]);
  const t = await getTranslations("platform");

  return (
    <main className="px-6 py-10 max-w-6xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("tenantsTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("tenantsSubtitle", { count: tenants.length })}
        </p>
      </header>

      <PlatformClient
        locale={locale}
        currentUserId={session?.user?.id ?? ""}
        initialQuery={sp.q ?? ""}
        tenants={tenants}
        plans={plans.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          maxUserAccounts: p.maxUserAccounts,
        }))}
      />
    </main>
  );
}
