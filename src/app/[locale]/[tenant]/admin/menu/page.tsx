import { setRequestLocale, getTranslations } from "next-intl/server";
import { listMenu } from "@/server/services/menu";
import { listTaxRates } from "@/server/services/taxes";
import { loadTenantForUser } from "@/server/repos/tenant";
import { effectiveAuth } from "@/server/auth/impersonation";
import { notFound } from "next/navigation";
import MenuClient from "./menu-client";

export default async function MenuPage({
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

  const t = await getTranslations("menu");
  const { categories, items } = await listMenu(slug);
  const taxes = await listTaxRates(slug);

  return (
    <main className="px-6 py-10 max-w-5xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      <MenuClient
        slug={slug}
        currency={ctx.tenant.currency}
        locale={locale}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          categoryId: i.categoryId,
          priceMinor: i.priceMinor,
          station: i.station,
          taxRateId: i.taxRateId,
        }))}
        taxRates={taxes.map((t) => ({
          id: t.id,
          name: t.name,
          bps: t.bps,
          inclusive: t.inclusive,
        }))}
      />
    </main>
  );
}
