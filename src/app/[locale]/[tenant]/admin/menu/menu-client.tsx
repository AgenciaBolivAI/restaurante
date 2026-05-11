"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createCategoryAction,
  createItemAction,
  deleteCategoryAction,
  deleteItemAction,
  updateCategoryAction,
  updateItemAction,
} from "@/server/services/menu";
import type { ActionState } from "@/server/services/types";
import { formatMoney } from "@/lib/money";

const initial: ActionState = { status: "idle" };

type Category = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  categoryId: string | null;
  priceMinor: number;
  station: "kitchen" | "bar" | "both" | "none";
  taxRateId: string | null;
};

type TaxRate = {
  id: string;
  name: string;
  bps: number;
  inclusive: boolean;
};

export default function MenuClient({
  slug,
  currency,
  locale,
  categories,
  items,
  taxRates,
}: {
  slug: string;
  currency: string;
  locale: string;
  categories: Category[];
  items: Item[];
  taxRates: TaxRate[];
}) {
  const t = useTranslations("menu");
  const tCommon = useTranslations("common");

  const catAction = createCategoryAction.bind(null, slug);
  const [catState, catFormAction, catPending] = useActionState(catAction, initial);

  const itemAction = createItemAction.bind(null, slug);
  const [itemState, itemFormAction, itemPending] = useActionState(itemAction, initial);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          {t("categories")}
        </h2>
        <form
          action={catFormAction}
          className="flex gap-2 mb-4"
        >
          <input
            name="name"
            required
            placeholder={t("categoryName")}
            className={inputCls + " flex-1"}
          />
          <button
            type="submit"
            disabled={catPending}
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            +
          </button>
        </form>
        {catState.status === "error" && (
          <p className="text-sm text-red-500 mb-2">{catState.message}</p>
        )}
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCategories")}</p>
        ) : (
          <ul className="space-y-1">
            {categories.map((c) => (
              <CategoryRow key={c.id} slug={slug} cat={c} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          {t("items")}
        </h2>

        <form
          action={itemFormAction}
          className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end mb-6 p-4 rounded-lg border border-foreground/10"
        >
          <Field label={t("itemName")} className="col-span-2">
            <input name="name" required className={inputCls} />
          </Field>
          <Field label={t("category")}>
            <select name="categoryId" defaultValue="" className={inputCls}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("price")}>
            <input
              name="priceMajor"
              type="number"
              min={0}
              step="0.01"
              required
              className={inputCls}
            />
          </Field>
          <Field label={t("station")}>
            <select name="station" defaultValue="kitchen" className={inputCls}>
              <option value="kitchen">{t("stations.kitchen")}</option>
              <option value="bar">{t("stations.bar")}</option>
              <option value="both">{t("stations.both")}</option>
              <option value="none">{t("stations.none")}</option>
            </select>
          </Field>
          <Field label={t("tax")}>
            <select name="taxRateId" defaultValue="" className={inputCls}>
              <option value="">—</option>
              {taxRates.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name} · {(tr.bps / 100).toFixed(2)}%
                  {tr.inclusive ? " (incl.)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={itemPending}
            className="col-span-2 sm:col-span-6 sm:w-auto sm:justify-self-end rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {itemPending ? tCommon("loading") : tCommon("create")}
          </button>
          {itemState.status === "error" && (
            <p className="col-span-full text-sm text-red-500">{itemState.message}</p>
          )}
        </form>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <ul className="divide-y divide-foreground/10 border border-foreground/10 rounded-lg">
            {items.map((i) => {
              const cat = i.categoryId
                ? categories.find((c) => c.id === i.categoryId)
                : null;
              return (
                <ItemRow
                  key={i.id}
                  slug={slug}
                  item={i}
                  category={cat?.name ?? null}
                  currency={currency}
                  locale={locale}
                  allCategories={categories}
                  allTaxRates={taxRates}
                />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function CategoryRow({ slug, cat }: { slug: string; cat: Category }) {
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  function save() {
    if (!name.trim() || name.trim() === cat.name) {
      setEditing(false);
      setName(cat.name);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", cat.id);
      fd.set("name", name.trim());
      await updateCategoryAction(slug, { status: "idle" }, fd);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1 px-2 py-1.5 rounded">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setName(cat.name);
            }
          }}
          onBlur={save}
          disabled={pending}
          className="flex-1 text-sm rounded border border-foreground/15 bg-transparent px-2 py-1"
        />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-1 px-2 py-1.5 rounded hover:bg-foreground/5 group">
      <button
        onClick={() => setEditing(true)}
        className="flex-1 text-left text-sm cursor-text"
      >
        {cat.name}
      </button>
      <button
        onClick={() =>
          startTransition(async () => {
            if (confirm(`Archive "${cat.name}"?`)) {
              await deleteCategoryAction(slug, cat.id);
            }
          })
        }
        disabled={pending}
        className="text-xs text-red-500 hover:underline opacity-0 group-hover:opacity-100"
      >
        {tCommon("delete")}
      </button>
    </li>
  );
}

function ItemRow({
  slug,
  item,
  category,
  currency,
  locale,
  allCategories,
  allTaxRates,
}: {
  slug: string;
  item: Item;
  category: string | null;
  currency: string;
  locale: string;
  allCategories: Category[];
  allTaxRates: TaxRate[];
}) {
  const t = useTranslations("menu");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <li className="flex items-center justify-between gap-3 px-4 py-3 group">
        <button
          onClick={() => setEditing(true)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="font-medium truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground">
            {category ?? "—"} · {t(`stations.${item.station}`)}
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <div className="font-mono text-sm">
            {formatMoney(item.priceMinor, currency, locale)}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:underline"
          >
            ✎
          </button>
          <button
            onClick={() =>
              startTransition(async () => {
                if (confirm(`Archive "${item.name}"?`)) {
                  await deleteItemAction(slug, item.id);
                }
              })
            }
            disabled={pending}
            className="text-xs text-red-500 hover:underline opacity-0 group-hover:opacity-100"
          >
            {tCommon("delete")}
          </button>
        </div>
      </li>
      {editing && (
        <EditItemModal
          slug={slug}
          item={item}
          allCategories={allCategories}
          allTaxRates={allTaxRates}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function EditItemModal({
  slug,
  item,
  allCategories,
  allTaxRates,
  onClose,
}: {
  slug: string;
  item: Item;
  allCategories: Category[];
  allTaxRates: TaxRate[];
  onClose: () => void;
}) {
  const t = useTranslations("menu");
  const tCommon = useTranslations("common");
  const action = updateItemAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);

  useEffect(() => {
    if (state.status === "ok") onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  return (
    <div className="fixed inset-0 z-30 bg-background/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-foreground/15 bg-background p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("editItem")}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl px-1">
            ×
          </button>
        </div>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={item.id} />

          <Field label={t("itemName")}>
            <input
              name="name"
              defaultValue={item.name}
              required
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("category")}>
              <select
                name="categoryId"
                defaultValue={item.categoryId ?? ""}
                className={inputCls}
              >
                <option value="">—</option>
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("price")}>
              <input
                name="priceMajor"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(item.priceMinor / 100).toFixed(2)}
                required
                className={inputCls + " font-mono"}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("station")}>
              <select
                name="station"
                defaultValue={item.station}
                className={inputCls}
              >
                <option value="kitchen">{t("stations.kitchen")}</option>
                <option value="bar">{t("stations.bar")}</option>
                <option value="both">{t("stations.both")}</option>
                <option value="none">{t("stations.none")}</option>
              </select>
            </Field>
            <Field label={t("tax")}>
              <select
                name="taxRateId"
                defaultValue={item.taxRateId ?? ""}
                className={inputCls}
              >
                <option value="">—</option>
                {allTaxRates.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name} · {(tr.bps / 100).toFixed(2)}%
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {state.status === "error" && (
            <p className="text-sm text-red-500">{state.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-foreground/15 hover:bg-foreground/5"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded bg-foreground text-background font-medium disabled:opacity-50"
            >
              {pending ? tCommon("loading") : tCommon("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:border-foreground/40";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
