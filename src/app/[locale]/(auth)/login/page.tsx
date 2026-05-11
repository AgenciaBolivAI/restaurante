import { setRequestLocale, getTranslations } from "next-intl/server";
import LoginForm from "./login-form";

export default async function LoginPage({
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
        <h1 className="text-2xl font-semibold mb-6">{t("loginTitle")}</h1>
        <LoginForm locale={locale} />
      </div>
    </main>
  );
}
