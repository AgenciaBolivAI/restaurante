import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { effectiveAuth } from "@/server/auth/impersonation";
import { loadTenantForUser } from "@/server/repos/tenant";
import { listEmployees } from "@/server/services/employees";
import EmployeesClient from "./employees-client";

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ locale: string; tenant: string }>;
}) {
  const { locale, tenant: slug } = await params;
  setRequestLocale(locale);

  const session = await effectiveAuth();
  if (!session) notFound();
  const ctx = await loadTenantForUser(slug, session.user.id);
  if (!ctx) notFound();

  const data = await listEmployees(slug);
  const t = await getTranslations("employees");

  return (
    <main className="px-6 py-10 max-w-4xl mx-auto w-full">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          {t("plan")}: <span className="font-medium">{data.plan.name}</span>
          <br />
          {data.activeCount}
          {data.plan.maxUserAccounts > 0 ? ` / ${data.plan.maxUserAccounts}` : ""}{" "}
          {t("activeAccounts")}
        </div>
      </header>

      <EmployeesClient
        slug={slug}
        currentUserId={session.user.id}
        currentRole={ctx.membership.role}
        data={data}
      />
    </main>
  );
}
