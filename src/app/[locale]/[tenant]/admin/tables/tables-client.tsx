"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createTableAction,
  deleteTableAction,
} from "@/server/services/tables";
import type { ActionState } from "@/server/services/types";

const initial: ActionState = { status: "idle" };

type Row = {
  id: string;
  number: number;
  seats: number;
  area: string | null;
  status: string;
};

export default function TablesClient({
  slug,
  rows,
}: {
  slug: string;
  rows: Row[];
}) {
  const t = useTranslations("tables");
  const tCommon = useTranslations("common");
  const action = createTableAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <div className="space-y-8">
      <form
        action={formAction}
        className="flex flex-wrap gap-3 items-end p-4 rounded-lg border border-foreground/10"
      >
        <Field label={t("number")}>
          <input
            name="number"
            type="number"
            min={1}
            required
            className={inputCls + " w-24"}
          />
        </Field>
        <Field label={t("seats")}>
          <input
            name="seats"
            type="number"
            min={1}
            defaultValue={2}
            className={inputCls + " w-20"}
          />
        </Field>
        <Field label={t("area")}>
          <input
            name="area"
            placeholder={t("areaPlaceholder")}
            className={inputCls + " w-40"}
          />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? tCommon("loading") : tCommon("create")}
        </button>
        {state.status === "error" && (
          <p className="text-sm text-red-500 w-full">{state.message}</p>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {rows.map((r) => (
            <TableCard key={r.id} slug={slug} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TableCard({ slug, row }: { slug: string; row: Row }) {
  const t = useTranslations("tables");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  return (
    <li className="rounded-lg border border-foreground/10 p-4 flex flex-col gap-1">
      <div className="text-3xl font-semibold">#{row.number}</div>
      <div className="text-xs text-muted-foreground">
        {row.seats} {t("seats").toLowerCase()}
        {row.area ? ` · ${row.area}` : ""}
      </div>
      <div className="text-xs mt-1">{t(`status.${row.status}` as "status.free")}</div>
      <button
        onClick={() =>
          startTransition(async () => {
            if (confirm(t("confirmDelete", { number: row.number }))) {
              await deleteTableAction(slug, row.id);
            }
          })
        }
        disabled={pending}
        className="mt-2 text-xs text-red-500 hover:underline self-start"
      >
        {tCommon("delete")}
      </button>
    </li>
  );
}

const inputCls =
  "rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:border-foreground/40";

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
