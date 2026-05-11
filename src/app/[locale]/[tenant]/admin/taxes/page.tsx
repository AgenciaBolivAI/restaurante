import { setRequestLocale, getTranslations } from "next-intl/server";
import { listTaxRates } from "@/server/services/taxes";
import TaxesClient from "./taxes-client";

export default async function TaxesPage({
  params,
}: {
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("taxes");
  const rates = await listTaxRates(slug);

  return (
    <main className="px-6 py-10 max-w-3xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      <TaxesClient
        slug={slug}
        rates={rates.map((r) => ({
          id: r.id,
          name: r.name,
          bps: r.bps,
          inclusive: r.inclusive,
        }))}
      />
    </main>
  );
}
