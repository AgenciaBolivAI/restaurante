import { setRequestLocale, getTranslations } from "next-intl/server";
import { listStationTickets } from "@/server/services/kds";
import KdsBoard from "../kds-board";

export default async function KitchenKdsPage({
  params,
}: {
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("kds");
  const initial = await listStationTickets(slug, "kitchen");

  return (
    <KdsBoard
      slug={slug}
      station="kitchen"
      initial={initial}
      labels={{
        title: t("kitchen"),
        empty: t("empty"),
        table: t("table"),
        togo: t("togo"),
        ready: t("ready"),
        unready: t("unready"),
        elapsedMin: t("elapsedMin"),
        elapsedSec: t("elapsedSec"),
      }}
    />
  );
}
