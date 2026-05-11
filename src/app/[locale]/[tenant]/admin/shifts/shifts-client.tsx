"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  closeShiftAction,
  openShiftAction,
} from "@/server/services/shifts";
import type { ActionState } from "@/server/services/types";
import { formatMoney } from "@/lib/money";

const initial: ActionState = { status: "idle" };

type OpenShift = {
  id: string;
  openedAt: string;
  openingFloatMinor: number;
};

type HistoryShift = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingFloatMinor: number;
  closingCountMinor: number | null;
  expectedMinor: number | null;
  varianceMinor: number | null;
};

export default function ShiftsClient({
  slug,
  currency,
  locale,
  open,
  history,
}: {
  slug: string;
  currency: string;
  locale: string;
  open: OpenShift | null;
  history: HistoryShift[];
}) {
  const t = useTranslations("shifts");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          {t("currentShift")}
        </h2>
        {open ? (
          <CloseShiftForm
            slug={slug}
            shiftId={open.id}
            currency={currency}
            locale={locale}
            openingFloat={open.openingFloatMinor}
            openedAt={open.openedAt}
          />
        ) : (
          <OpenShiftForm slug={slug} currency={currency} />
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          {t("history")}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul className="border border-foreground/10 rounded-lg divide-y divide-foreground/10">
            {history.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {fmtTime(s.openedAt, locale)} →{" "}
                    {s.closedAt ? fmtTime(s.closedAt, locale) : "..."}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("opened")}: {formatMoney(s.openingFloatMinor, currency, locale)}
                    {s.closingCountMinor !== null && (
                      <>
                        {" · "}
                        {t("closed")}:{" "}
                        {formatMoney(s.closingCountMinor, currency, locale)}
                      </>
                    )}
                  </div>
                </div>
                {s.varianceMinor !== null && (
                  <div
                    className={
                      "font-mono text-sm tabular-nums " +
                      (s.varianceMinor === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : s.varianceMinor < 0
                          ? "text-red-500"
                          : "text-amber-600 dark:text-amber-400")
                    }
                  >
                    {s.varianceMinor > 0 ? "+" : ""}
                    {formatMoney(s.varianceMinor, currency, locale)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OpenShiftForm({ slug, currency }: { slug: string; currency: string }) {
  const t = useTranslations("shifts");
  const tCommon = useTranslations("common");
  const action = openShiftAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form
      action={formAction}
      className="p-4 rounded-lg border border-foreground/10 flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("openingFloat")} ({currency})
        </span>
        <input
          name="openingFloatMajor"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0.00"
          className="rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-foreground/40 w-32"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? tCommon("loading") : t("openShift")}
      </button>
      {state.status === "error" && (
        <p className="text-sm text-red-500 w-full">{state.message}</p>
      )}
    </form>
  );
}

function CloseShiftForm({
  slug,
  shiftId,
  currency,
  locale,
  openingFloat,
  openedAt,
}: {
  slug: string;
  shiftId: string;
  currency: string;
  locale: string;
  openingFloat: number;
  openedAt: string;
}) {
  const t = useTranslations("shifts");
  const tCommon = useTranslations("common");
  const action = closeShiftAction.bind(null, slug, shiftId);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form
      action={formAction}
      className="p-4 rounded-lg border border-emerald-500/40 bg-emerald-500/5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-semibold">
            {t("openSince")}
          </div>
          <div className="text-sm">{fmtTime(openedAt, locale)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {t("openingFloat")}: {formatMoney(openingFloat, currency, locale)}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("countedCash")} ({currency})
        </span>
        <input
          name="closingCountMajor"
          type="number"
          min="0"
          step="0.01"
          required
          className="rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-foreground/40"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("notes")}
        </span>
        <input
          name="notes"
          className="rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:border-foreground/40"
        />
      </label>

      {state.status === "error" && (
        <p className="text-sm text-red-500">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? tCommon("loading") : t("closeShift")}
      </button>
    </form>
  );
}

function fmtTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
