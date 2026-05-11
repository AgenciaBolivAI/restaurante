"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  inviteEmployeeAction,
  setMembershipActiveAction,
  setPinAction,
  updateRoleAction,
  type EmployeeRow,
  type EmployeesPageData,
} from "@/server/services/employees";
import type { ActionState } from "@/server/services/types";

const initial: ActionState = { status: "idle" };

const ROLES = ["owner", "manager", "waiter", "kitchen", "bar", "cashier"] as const;

export default function EmployeesClient({
  slug,
  currentUserId,
  currentRole,
  data,
}: {
  slug: string;
  currentUserId: string;
  currentRole: string;
  data: EmployeesPageData;
}) {
  const t = useTranslations("employees");

  return (
    <div className="space-y-8">
      {data.canInvite ? (
        <InviteForm slug={slug} currentRole={currentRole} />
      ) : (
        <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-500/5 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            {t("limitReached", {
              max: data.plan.maxUserAccounts,
              plan: data.plan.name,
            })}
          </p>
          <p className="text-muted-foreground mt-1">{t("upgradeHint")}</p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          {t("teamTitle")}
        </h2>
        {data.employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="border border-foreground/10 rounded-lg divide-y divide-foreground/10">
            {data.employees.map((emp) => (
              <EmployeeItem
                key={emp.membershipId}
                slug={slug}
                emp={emp}
                currentUserId={currentUserId}
                currentRole={currentRole}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteForm({
  slug,
  currentRole,
}: {
  slug: string;
  currentRole: string;
}) {
  const t = useTranslations("employees");
  const tCommon = useTranslations("common");
  const action = inviteEmployeeAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form
      action={formAction}
      className="p-4 rounded-lg border border-foreground/10 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <h2 className="sm:col-span-2 text-sm font-semibold uppercase tracking-wide">
        {t("inviteTitle")}
      </h2>

      <Field label={t("name")}>
        <input name="name" required className={inputCls} />
      </Field>
      <Field label={t("email")}>
        <input name="email" type="email" required className={inputCls} />
      </Field>
      <Field label={t("password")}>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className={inputCls}
        />
      </Field>
      <Field label={t("role")}>
        <select name="role" defaultValue="waiter" className={inputCls}>
          {ROLES.map((r) => (
            <option key={r} value={r} disabled={r === "owner" && currentRole !== "owner"}>
              {t(`roles.${r}` as "roles.owner")}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${t("pin")} (${t("optional")})`}>
        <input
          name="pin"
          inputMode="numeric"
          pattern="\d{4,8}"
          placeholder="1234"
          className={inputCls}
        />
      </Field>

      <div className="sm:col-span-2 flex items-center justify-between gap-3">
        {state.status === "error" ? (
          <p className="text-sm text-red-500">{state.message}</p>
        ) : state.status === "ok" ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            ✓ {t("invited")}
          </p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? tCommon("loading") : t("inviteCta")}
        </button>
      </div>
    </form>
  );
}

function EmployeeItem({
  slug,
  emp,
  currentUserId,
  currentRole,
}: {
  slug: string;
  emp: EmployeeRow;
  currentUserId: string;
  currentRole: string;
}) {
  const t = useTranslations("employees");
  const [pending, startTransition] = useTransition();
  const isMe = emp.userId === currentUserId;
  const canChangeRole = !isMe && (currentRole === "owner" || emp.role !== "owner");

  return (
    <li className={"px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 " + (emp.active ? "" : "opacity-50")}>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {emp.name ?? emp.email}
          {isMe && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({t("you")})
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {emp.email}
          {emp.hasPin && " · 🔑"}
          {emp.isClockedIn && (
            <span className="ml-1 text-emerald-600 dark:text-emerald-400">
              · ⏱ {t("clockedIn")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canChangeRole ? (
          <RoleSelect slug={slug} emp={emp} currentRole={currentRole} />
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-foreground/10">
            {t(`roles.${emp.role}` as "roles.owner")}
          </span>
        )}

        {!isMe && (
          <button
            onClick={() =>
              startTransition(async () => {
                await setMembershipActiveAction(
                  slug,
                  emp.membershipId,
                  !emp.active,
                );
              })
            }
            disabled={pending}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            {emp.active ? t("deactivate") : t("reactivate")}
          </button>
        )}

        {currentRole === "owner" || (currentRole === "manager" && emp.role !== "owner") ? (
          <SetPinForm slug={slug} membershipId={emp.membershipId} />
        ) : null}
      </div>
    </li>
  );
}

function RoleSelect({
  slug,
  emp,
  currentRole,
}: {
  slug: string;
  emp: EmployeeRow;
  currentRole: string;
}) {
  const t = useTranslations("employees");
  const action = updateRoleAction.bind(null, slug);
  const [, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="membershipId" value={emp.membershipId} />
      <select
        name="role"
        defaultValue={emp.role}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="text-xs rounded border border-foreground/15 bg-transparent px-2 py-1"
      >
        {ROLES.map((r) => (
          <option
            key={r}
            value={r}
            disabled={r === "owner" && currentRole !== "owner"}
          >
            {t(`roles.${r}` as "roles.owner")}
          </option>
        ))}
      </select>
    </form>
  );
}

function SetPinForm({
  slug,
  membershipId,
}: {
  slug: string;
  membershipId: string;
}) {
  const t = useTranslations("employees");
  const action = setPinAction.bind(null, slug);
  const [, , pending] = useActionState(action, initial);
  const [busy, startTransition] = useTransition();

  function ask() {
    const pin = prompt(t("setPinPrompt"));
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      alert(t("setPinError"));
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("membershipId", membershipId);
      fd.set("pin", pin);
      await setPinAction(slug, { status: "idle" }, fd);
    });
  }

  return (
    <button
      onClick={ask}
      disabled={pending || busy}
      className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
    >
      🔑 {t("setPin")}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40";
