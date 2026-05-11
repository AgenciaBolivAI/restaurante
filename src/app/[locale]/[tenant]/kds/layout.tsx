import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function KdsLayout({
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

  return <div className="flex flex-col flex-1 min-h-0 bg-background">{children}</div>;
}
