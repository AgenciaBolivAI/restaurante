"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createTaxRateAction,
  deleteTaxRateAction,
} from "@/server/services/taxes";
import type { ActionState } from "@/server/services/types";

const initial: ActionState = { status: "idle" };

type Rate = { id: string; name: string; bps: number; inclusive: boolean };

export default function TaxesClient({
  slug,
  rates,
}: {
  slug: string;
  rates: Rate[];
}) {
  const t = useTranslations("taxes");
  const tCommon = useTranslations("common");
  const action = createTaxRateAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <div className="space-y-8">
      <form
        action={formAction}
        className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto_auto] gap-3 items-end p-4 rounded-lg border border-foreground/10"
      >
        <Field label={t("name")}>
          <input
            name="name"
            required
            placeholder={t("namePlaceholder")}
            className={inputCls}
          />
        </Field>
        <Field label={`${t("rate")} (%)`}>
          <input
            name="percent"
            type="number"
            min="0"
            max="99.99"
            step="0.01"
            required
            className={inputCls + " font-mono"}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inclusive" />
          <span>{t("inclusive")}</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? tCommon("loading") : tCommon("create")}
        </button>
        {state.status === "error" && (
          <p className="col-span-full text-sm text-red-500">{state.message}</p>
        )}
      </form>

      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="border border-foreground/10 rounded-lg divide-y divide-foreground/10">
          {rates.map((r) => (
            <RateRow key={r.id} slug={slug} rate={r} />
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}

function RateRow({ slug, rate }: { slug: string; rate: Rate }) {
  const t = useTranslations("taxes");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium">{rate.name}</div>
        <div className="text-xs text-muted-foreground">
          {(rate.bps / 100).toFixed(2)}%{" "}
          {rate.inclusive ? `· ${t("inclusiveTag")}` : `· ${t("exclusiveTag")}`}
        </div>
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            if (confirm(t("confirmDelete", { name: rate.name }))) {
              await deleteTaxRateAction(slug, rate.id);
            }
          })
        }
        disabled={pending}
        className="text-xs text-red-500 hover:underline disabled:opacity-50"
      >
        {tCommon("delete")}
      </button>
    </li>
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
