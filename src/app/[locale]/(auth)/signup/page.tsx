import { setRequestLocale, getTranslations } from "next-intl/server";
import SignupForm from "./signup-form";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-2">{t("signupTitle")}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t("signupSubtitle")}</p>
        <SignupForm locale={locale} />
      </div>
    </main>
  );
}
