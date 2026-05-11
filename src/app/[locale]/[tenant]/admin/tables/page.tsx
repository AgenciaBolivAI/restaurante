import { setRequestLocale, getTranslations } from "next-intl/server";
import { listTables } from "@/server/services/tables";
import TablesClient from "./tables-client";

export default async function TablesPage({
  params,
}: {
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("tables");
  const rows = await listTables(slug);

  return (
    <main className="px-6 py-10 max-w-4xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      <TablesClient
        slug={slug}
        rows={rows.map((r) => ({
          id: r.id,
          number: r.number,
          seats: r.seats,
          area: r.area,
          status: r.status,
        }))}
      />
    </main>
  );
}
