import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { Link } from "@/i18n/navigation";
import { loadTenantForUser } from "@/server/repos/tenant";
import { signOutAction } from "@/server/auth/actions";
import { type Locale } from "@/i18n/routing";
import { getActiveEntry } from "@/server/services/timeclock";
import { requireTenantScope } from "@/server/repos/tenant-scope";
import ClockButton from "./clock-button";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default async function PosLayout({
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

  const tCommon = await getTranslations("common");
  const tPos = await getTranslations("pos");

  const scope = await requireTenantScope(slug);
  const activeEntry = await getActiveEntry(scope.tenantId, scope.userId);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="flex items-center justify-between px-4 py-3 border-b border-foreground/10 sticky top-0 bg-background z-10">
        <Link href={`/${slug}/pos`} className="font-semibold truncate">
          {tPos("title")}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <ClockButton
            slug={slug}
            activeSinceIso={activeEntry?.clockIn.toISOString() ?? null}
            labels={{
              clockIn: tPos("clockIn"),
              clockOut: tPos("clockOut"),
            }}
          />
          <span className="text-muted-foreground hidden sm:inline">
            {session.user.name ?? session.user.email}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-foreground/10">
            {ctx.membership.role}
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
