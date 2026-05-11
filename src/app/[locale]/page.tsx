import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");
  const tCommon = await getTranslations("common");

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight max-w-3xl">
        {t("headline")}
      </h1>
      <p className="mt-6 text-lg text-muted-foreground max-w-xl">
        {t("subheadline")}
      </p>
      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-foreground text-background px-6 py-3 font-medium hover:opacity-90"
        >
          {t("ctaSignUp")}
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-foreground/20 px-6 py-3 font-medium hover:bg-foreground/5"
        >
          {tCommon("signIn")}
        </Link>
      </div>
    </main>
  );
}
