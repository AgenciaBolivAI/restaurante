import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const session = await effectiveAuth();
  if (!session) {
    redirect(`/${locale}/login`);
  }

  const ctx = await loadTenantForUser(slug, session.user.id);
  if (!ctx) notFound();

  if (ctx.tenant.status === "suspended" || ctx.tenant.status === "cancelled") {
    redirect(`/${locale}/account-suspended`);
  }

  return <>{children}</>;
}
