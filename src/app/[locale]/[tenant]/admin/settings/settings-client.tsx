"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateTenantSettingsAction } from "@/server/services/tenant-settings";
import type { ActionState } from "@/server/services/types";

const initial: ActionState = { status: "idle" };

const COMMON_CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL", "GBP"];
const COMMON_TZ = [
  "UTC",
  "America/Mexico_City",
  "America/Bogota",
  "America/Buenos_Aires",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
];

type Tenant = {
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  locale: string;
  address: string;
  receiptFooter: string;
  status: "trial" | "active" | "suspended" | "cancelled";
  trialEndsAtIso: string | null;
};

export default function SettingsClient({
  slug,
  readOnly,
  tenant,
}: {
  slug: string;
  readOnly: boolean;
  tenant: Tenant;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const action = updateTenantSettingsAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-foreground/10 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Meta label={t("slug")} value={tenant.slug} />
          <Meta label={t("status")} value={tenant.status} />
          {tenant.trialEndsAtIso && (
            <Meta
              label={t("trialEnds")}
              value={new Date(tenant.trialEndsAtIso).toLocaleDateString()}
            />
          )}
        </div>
      </section>

      <form action={formAction} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4 disabled:opacity-60">
          <Field label={t("name")}>
            <input
              name="name"
              defaultValue={tenant.name}
              required
              maxLength={120}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("currency")}>
              <input
                name="currency"
                defaultValue={tenant.currency}
                required
                list="currency-list"
                maxLength={3}
                className={inputCls + " uppercase font-mono"}
              />
              <datalist id="currency-list">
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label={t("locale")}>
              <select name="locale" defaultValue={tenant.locale} className={inputCls}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>

          <Field label={t("timezone")}>
            <input
              name="timezone"
              defaultValue={tenant.timezone}
              required
              list="tz-list"
              className={inputCls + " font-mono text-xs"}
            />
            <datalist id="tz-list">
              {COMMON_TZ.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </Field>

          <Field label={t("address")}>
            <textarea
              name="address"
              defaultValue={tenant.address}
              rows={2}
              maxLength={300}
              className={inputCls + " resize-none"}
            />
          </Field>

          <Field label={t("receiptFooter")}>
            <textarea
              name="receiptFooter"
              defaultValue={tenant.receiptFooter}
              rows={2}
              maxLength={300}
              placeholder={t("receiptFooterPlaceholder")}
              className={inputCls + " resize-none"}
            />
          </Field>
        </fieldset>

        {state.status === "error" && (
          <p className="text-sm text-red-500">{state.message}</p>
        )}
        {state.status === "ok" && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            ✓ {t("saved")}
          </p>
        )}

        {!readOnly && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-foreground text-background px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pending ? tCommon("loading") : tCommon("save")}
            </button>
          </div>
        )}
      </form>
    </div>
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">
        {label}
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40";
