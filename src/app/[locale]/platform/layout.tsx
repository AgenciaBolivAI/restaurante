import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/server/auth/actions";
import { type Locale } from "@/i18n/routing";

export default async function PlatformLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);
  if (!session.user.isPlatformAdmin) notFound();

  const t = await getTranslations("platform");
  const tCommon = await getTranslations("common");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="px-6 py-3 border-b border-foreground/10 flex items-center justify-between bg-foreground/5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-foreground text-background rounded">
            DEV
          </span>
          <h1 className="font-semibold">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground hidden sm:inline">
            {session.user.email}
          </span>
          <form action={signOutAction.bind(null, locale as Locale)}>
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:underline"
            >
              {tCommon("signOut")}
            </button>
          </form>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}
