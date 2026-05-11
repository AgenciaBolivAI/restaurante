import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { Link } from "@/i18n/navigation";
import { loadTenantForUser } from "@/server/repos/tenant";
import { signOutAction } from "@/server/auth/actions";
import { type Locale } from "@/i18n/routing";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const session = await effectiveAuth();
  if (!session) notFound();
  const ctx = await loadTenantForUser(slug, session.user.id);
  if (!ctx) notFound();

  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
  const isPlatformAdmin = !!session.user.isPlatformAdmin || session.impersonating;

  const navItems = [
    { href: `/${slug}/admin`, label: t("dashboard"), icon: "📊" },
    { href: `/${slug}/admin/tables`, label: t("tables"), icon: "🪑" },
    { href: `/${slug}/admin/menu`, label: t("menu"), icon: "📖" },
    { href: `/${slug}/admin/taxes`, label: t("taxes"), icon: "%" },
    { href: `/${slug}/admin/employees`, label: t("employees"), icon: "👥" },
    { href: `/${slug}/admin/shifts`, label: t("shifts"), icon: "💵" },
    { href: `/${slug}/admin/reports`, label: t("reports"), icon: "📈" },
    { href: `/${slug}/admin/settings`, label: t("settings"), icon: "⚙️" },
    { href: `/${slug}/pos`, label: t("pos"), icon: "📱" },
    { href: `/${slug}/kds/kitchen`, label: t("kdsKitchen"), icon: "🍳" },
    { href: `/${slug}/kds/bar`, label: t("kdsBar"), icon: "🍸" },
  ];

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-60 shrink-0 border-r border-foreground/10 px-4 py-5 hidden md:flex flex-col gap-1">
        <div className="px-2 mb-4">
          <div className="font-semibold truncate">{ctx.tenant.name}</div>
          <div className="text-xs text-muted-foreground">{ctx.membership.role}</div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-foreground/5"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        {isPlatformAdmin && (
          <Link
            href="/platform"
            className="mt-auto flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-foreground/5 border border-dashed border-foreground/20"
          >
            <span>🛠</span>
            <span>{t("platform")}</span>
          </Link>
        )}
        <form
          action={signOutAction.bind(null, locale as Locale)}
          className={isPlatformAdmin ? "" : "mt-auto"}
        >
          <button
            type="submit"
            className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-foreground/5"
          >
            ↪ {tCommon("signOut")}
          </button>
        </form>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">{children}</div>
    </div>
  );
}
