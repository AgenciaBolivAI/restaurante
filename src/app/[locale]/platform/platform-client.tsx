"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  changePlanAction,
  extendTrialAction,
  setTenantStatusAction,
  type PlatformTenant,
} from "@/server/platform/platform";
import { startImpersonationAction } from "@/server/auth/impersonation-actions";

type Plan = {
  id: string;
  code: string;
  name: string;
  maxUserAccounts: number;
};

const STATUSES = ["trial", "active", "suspended", "cancelled"] as const;

export default function PlatformClient({
  locale,
  currentUserId,
  initialQuery,
  tenants,
  plans,
}: {
  locale: string;
  currentUserId: string;
  initialQuery: string;
  tenants: PlatformTenant[];
  plans: Plan[];
}) {
  const router = useRouter();
  const t = useTranslations("platform");
  const [q, setQ] = useState(initialQuery);

  function search(value: string) {
    setQ(value);
    const url = value
      ? `/${locale}/platform?q=${encodeURIComponent(value)}`
      : `/${locale}/platform`;
    router.push(url);
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
      />

      {tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          {t("empty")}
        </p>
      ) : (
        <ul className="border border-foreground/10 rounded-lg divide-y divide-foreground/10">
          {tenants.map((tn) => (
            <TenantRow
              key={tn.id}
              tenant={tn}
              plans={plans}
              locale={locale}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TenantRow({
  tenant,
  plans,
  locale,
  currentUserId,
}: {
  tenant: PlatformTenant;
  plans: Plan[];
  locale: string;
  currentUserId: string;
}) {
  const t = useTranslations("platform");
  const [busy, setBusy] = useState<"status" | "trial" | "plan" | null>(null);

  async function setStatus(newStatus: PlatformTenant["status"]) {
    if (newStatus === tenant.status) return;
    if (
      newStatus === "suspended" &&
      !confirm(t("confirmSuspend", { name: tenant.name }))
    ) {
      return;
    }
    setBusy("status");
    const fd = new FormData();
    fd.set("tenantId", tenant.id);
    fd.set("status", newStatus);
    await setTenantStatusAction({ status: "idle" }, fd);
    setBusy(null);
  }

  async function extendTrial(days: number) {
    setBusy("trial");
    const fd = new FormData();
    fd.set("tenantId", tenant.id);
    fd.set("days", String(days));
    await extendTrialAction({ status: "idle" }, fd);
    setBusy(null);
  }

  async function setPlan(planCode: string) {
    if (planCode === tenant.planCode) return;
    setBusy("plan");
    const fd = new FormData();
    fd.set("tenantId", tenant.id);
    fd.set("planCode", planCode);
    await changePlanAction({ status: "idle" }, fd);
    setBusy(null);
  }

  const trialDaysLeft =
    tenant.trialEndsAt
      ? Math.ceil(
          (new Date(tenant.trialEndsAt).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

  const statusColor: Record<PlatformTenant["status"], string> = {
    trial: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    suspended: "bg-red-500/15 text-red-600 dark:text-red-400",
    cancelled: "bg-foreground/10 text-muted-foreground",
  };

  return (
    <li className="px-4 py-4 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{tenant.name}</span>
          <span
            className={
              "text-xs px-1.5 py-0.5 rounded uppercase font-mono tracking-wide " +
              statusColor[tenant.status]
            }
          >
            {tenant.status}
          </span>
        </div>
        <div className="text-xs text-muted-foreground font-mono truncate">
          {tenant.slug} · {tenant.currency} · {tenant.locale}
        </div>
        {tenant.ownerEmail && (
          <div className="text-xs text-muted-foreground truncate">
            👤 {tenant.ownerEmail} · {tenant.activeMembers} {t("members")}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {t("created")}: {fmtDate(tenant.createdAt, locale)}
          {trialDaysLeft !== null && (
            <>
              {" · "}
              {trialDaysLeft > 0
                ? t("trialDaysLeft", { days: trialDaysLeft })
                : t("trialExpired")}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
          {t("plan")}
        </span>
        <select
          value={tenant.planCode ?? ""}
          onChange={(e) => setPlan(e.target.value)}
          disabled={busy === "plan"}
          className="text-xs rounded border border-foreground/15 bg-transparent px-2 py-1"
        >
          {tenant.planCode === null && <option value="">—</option>}
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} ({p.maxUserAccounts === 0 ? "∞" : p.maxUserAccounts})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
          {t("status")}
        </span>
        <select
          value={tenant.status}
          onChange={(e) => setStatus(e.target.value as PlatformTenant["status"])}
          disabled={busy === "status"}
          className="text-xs rounded border border-foreground/15 bg-transparent px-2 py-1"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => extendTrial(7)}
          disabled={busy === "trial"}
          className="text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 whitespace-nowrap"
        >
          + 7 {t("days")}
        </button>
        <button
          onClick={() => extendTrial(30)}
          disabled={busy === "trial"}
          className="text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 whitespace-nowrap"
        >
          + 30 {t("days")}
        </button>
        <a
          href={`/${locale}/${tenant.slug}/admin`}
          target="_blank"
          rel="noopener"
          className="text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 text-center whitespace-nowrap"
          title={t("openTenant")}
        >
          ↗ {t("open")}
        </a>
        {tenant.ownerUserId && tenant.ownerUserId !== currentUserId ? (
          <form
            action={startImpersonationAction.bind(null, tenant.ownerUserId)}
          >
            <button
              type="submit"
              className="w-full text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
              title={t("loginAsOwnerHint")}
            >
              👤 {t("loginAs")}
            </button>
          </form>
        ) : tenant.ownerUserId === currentUserId ? (
          <span className="text-xs text-muted-foreground italic text-center">
            {t("youAreOwner")}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function fmtDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
