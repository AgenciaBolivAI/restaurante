"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  addItemAction,
  removeItemAction,
  sendToStationsAction,
} from "@/server/services/orders";
import {
  recordPaymentAction,
  voidItemAction,
} from "@/server/services/payments";
import type { ActionState } from "@/server/services/types";
import { formatMoney } from "@/lib/money";

type Order = {
  id: string;
  status: string;
  sequenceNo: number;
  orderType: "dine_in" | "to_go" | "delivery";
  openedByUserId: string;
  openedByName: string | null;
  totalMinor: number;
  tableNumber: number | null;
};

type Item = {
  id: string;
  name: string;
  qty: number;
  unitPriceMinor: number;
  notes: string | null;
  station: "kitchen" | "bar" | "both" | "none";
  kdsStatus: "pending" | "preparing" | "ready" | "served" | "void";
  addedByUserId: string;
  addedByName: string | null;
};

type Assignee = { userId: string; name: string; isPrimary: boolean };
type MenuItem = {
  id: string;
  name: string;
  categoryId: string | null;
  priceMinor: number;
  station: "kitchen" | "bar" | "both" | "none";
};
type Category = { id: string; name: string };

type Labels = {
  orderNumber: string;
  tableLabel: string;
  togo: string;
  openedBy: string;
  assignees: string;
  itemsTitle: string;
  noItems: string;
  addItem: string;
  search: string;
  send: string;
  back: string;
  remove: string;
  notes: string;
  qty: string;
  pay: string;
  payTitle: string;
  method: string;
  methods: { cash: string; card: string; transfer: string; other: string };
  amount: string;
  tip: string;
  remaining: string;
  paid: string;
  confirm: string;
  printReceipt: string;
  paidStatus: string;
  voidLabel: string;
  voidReason: string;
  status: Record<Item["kdsStatus"], string>;
};

const KDS_COLOR: Record<Item["kdsStatus"], string> = {
  pending: "text-muted-foreground",
  preparing: "text-amber-600 dark:text-amber-400",
  ready: "text-emerald-600 dark:text-emerald-400",
  served: "text-foreground/40",
  void: "text-red-500 line-through",
};

export default function OrderDetail({
  slug,
  currency,
  locale,
  currentUserId,
  labels,
  order,
  items,
  assignees,
  menu,
  categories,
  payment,
  canVoid,
}: {
  slug: string;
  currency: string;
  locale: string;
  currentUserId: string;
  labels: Labels;
  order: Order;
  items: Item[];
  assignees: Assignee[];
  menu: MenuItem[];
  categories: Category[];
  payment: { paid: number; tip: number; remaining: number; count: number };
  canVoid: boolean;
}) {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const pendingCount = items.filter((i) => i.kdsStatus === "pending").length;
  const isPaid = order.status === "paid";

  return (
    <div className="space-y-6">
      {/* Order header */}
      <header className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push(`/${slug}/pos`)}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← {labels.back}
          </button>
          <h1 className="text-2xl font-semibold mt-1">
            {order.tableNumber !== null
              ? `${labels.tableLabel} #${order.tableNumber}`
              : labels.togo}
            {" · "}
            <span className="font-mono">#{order.sequenceNo}</span>
          </h1>
          <div className="text-xs text-muted-foreground mt-1">
            {labels.openedBy}: {order.openedByName ?? "?"}
            {assignees.length > 1 && (
              <>
                {" · "}
                {labels.assignees}:{" "}
                {assignees
                  .map((a) => `${a.name}${a.isPrimary ? "*" : ""}`)
                  .join(", ")}
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase">
            {labels.itemsTitle}
          </div>
          <div className="font-mono text-xl">
            {formatMoney(order.totalMinor, currency, locale)}
          </div>
        </div>
      </header>

      {/* Items list */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.noItems}</p>
      ) : (
        <ul className="divide-y divide-foreground/10 border border-foreground/10 rounded-lg">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              slug={slug}
              orderId={order.id}
              item={it}
              currency={currency}
              locale={locale}
              currentUserId={currentUserId}
              canVoid={canVoid}
              labels={labels}
            />
          ))}
        </ul>
      )}

      {/* Payment status */}
      {payment.count > 0 && !isPaid && (
        <div className="text-xs text-muted-foreground">
          {labels.paid}: {formatMoney(payment.paid, currency, locale)} ·{" "}
          {labels.remaining}:{" "}
          <span className="font-mono">
            {formatMoney(payment.remaining, currency, locale)}
          </span>
        </div>
      )}

      {isPaid && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/40 px-4 py-3 text-sm flex items-center justify-between">
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
            ✓ {labels.paidStatus}
          </span>
          <a
            href={`/api/receipts/${order.id}`}
            target="_blank"
            rel="noopener"
            className="text-sm font-medium underline"
          >
            {labels.printReceipt}
          </a>
        </div>
      )}

      {/* Action buttons */}
      {!isPaid && (
        <div className="flex gap-2 sticky bottom-0 py-3 bg-background border-t border-foreground/10">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex-1 rounded-md bg-foreground text-background px-4 py-3 font-medium"
          >
            + {labels.addItem}
          </button>
          {pendingCount > 0 ? (
            <SendButton
              slug={slug}
              orderId={order.id}
              label={`${labels.send} (${pendingCount})`}
            />
          ) : (
            items.some((i) => i.kdsStatus !== "void") && (
              <button
                onClick={() => setShowPay(true)}
                className="flex-1 rounded-md bg-emerald-600 text-white px-4 py-3 font-medium"
              >
                {labels.pay} · {formatMoney(payment.remaining, currency, locale)}
              </button>
            )
          )}
        </div>
      )}

      {/* Payment modal */}
      {showPay && (
        <PaymentModal
          slug={slug}
          orderId={order.id}
          currency={currency}
          locale={locale}
          remaining={payment.remaining}
          labels={labels}
          onClose={() => setShowPay(false)}
        />
      )}

      {/* Item picker */}
      {showPicker && (
        <ItemPicker
          slug={slug}
          orderId={order.id}
          menu={menu}
          categories={categories}
          currency={currency}
          locale={locale}
          labels={labels}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function ItemRow({
  slug,
  orderId,
  item,
  currency,
  locale,
  canVoid,
  labels,
}: {
  slug: string;
  orderId: string;
  item: Item;
  currency: string;
  locale: string;
  currentUserId: string;
  canVoid: boolean;
  labels: Labels;
}) {
  const [pending, startTransition] = useTransition();
  const lineTotal = item.qty * item.unitPriceMinor;
  const isVoid = item.kdsStatus === "void";

  function doVoid() {
    const reason = prompt(labels.voidReason);
    if (!reason || !reason.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("itemId", item.id);
      fd.set("reason", reason.trim());
      await voidItemAction(slug, orderId, { status: "idle" }, fd);
    });
  }

  return (
    <li className={"px-4 py-3 flex items-center gap-3 " + (isVoid ? "opacity-50" : "")}>
      <div className="font-mono text-sm w-6 shrink-0">{item.qty}×</div>
      <div className="flex-1 min-w-0">
        <div className={"font-medium truncate " + (isVoid ? "line-through" : "")}>
          {item.name}
        </div>
        <div className="text-xs flex items-center gap-2">
          <span className={KDS_COLOR[item.kdsStatus]}>
            {labels.status[item.kdsStatus]}
          </span>
          {item.notes && (
            <span className="text-muted-foreground italic truncate">
              · {item.notes}
            </span>
          )}
          {item.addedByName && (
            <span className="text-muted-foreground">· {item.addedByName}</span>
          )}
        </div>
      </div>
      <div className={"font-mono text-sm tabular-nums " + (isVoid ? "line-through" : "")}>
        {formatMoney(lineTotal, currency, locale)}
      </div>
      {item.kdsStatus === "pending" && (
        <button
          onClick={() =>
            startTransition(async () => {
              await removeItemAction(slug, orderId, item.id);
            })
          }
          disabled={pending}
          className="text-xs text-red-500 hover:underline"
        >
          {labels.remove}
        </button>
      )}
      {item.kdsStatus !== "pending" && !isVoid && canVoid && (
        <button
          onClick={doVoid}
          disabled={pending}
          className="text-xs text-red-500 hover:underline"
        >
          {labels.voidLabel}
        </button>
      )}
    </li>
  );
}

function SendButton({
  slug,
  orderId,
  label,
}: {
  slug: string;
  orderId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await sendToStationsAction(slug, orderId);
        })
      }
      disabled={pending}
      className="flex-1 rounded-md bg-emerald-600 text-white px-4 py-3 font-medium disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function ItemPicker({
  slug,
  orderId,
  menu,
  categories,
  currency,
  locale,
  labels,
  onClose,
}: {
  slug: string;
  orderId: string;
  menu: MenuItem[];
  categories: Category[];
  currency: string;
  locale: string;
  labels: Labels;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter((m) => {
      if (activeCat !== "all" && m.categoryId !== activeCat) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menu, query, activeCat]);

  return (
    <div className="fixed inset-0 z-20 bg-background flex flex-col">
      <header className="flex items-center gap-2 p-3 border-b border-foreground/10">
        <button
          onClick={onClose}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {labels.back}
        </button>
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.search}
          className="flex-1 rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
        />
      </header>

      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-foreground/10 shrink-0">
        <CatPill
          active={activeCat === "all"}
          onClick={() => setActiveCat("all")}
        >
          All
        </CatPill>
        {categories.map((c) => (
          <CatPill
            key={c.id}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
          >
            {c.name}
          </CatPill>
        ))}
      </div>

      <ul className="flex-1 overflow-auto divide-y divide-foreground/10">
        {filtered.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">—</li>
        ) : (
          filtered.map((m) => (
            <PickerRow
              key={m.id}
              slug={slug}
              orderId={orderId}
              item={m}
              currency={currency}
              locale={locale}
              labels={labels}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function CatPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 px-3 py-1 rounded-full text-xs font-medium border " +
        (active
          ? "bg-foreground text-background border-foreground"
          : "border-foreground/15 hover:bg-foreground/5")
      }
    >
      {children}
    </button>
  );
}

function PaymentModal({
  slug,
  orderId,
  currency,
  locale,
  remaining,
  labels,
  onClose,
}: {
  slug: string;
  orderId: string;
  currency: string;
  locale: string;
  remaining: number;
  labels: Labels;
  onClose: () => void;
}) {
  const action = recordPaymentAction.bind(null, slug, orderId);
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  } as ActionState);

  // Close on success
  if (state.status === "ok") {
    setTimeout(onClose, 0);
  }

  return (
    <div className="fixed inset-0 z-30 bg-background/80 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{labels.payTitle}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <Field label={labels.method}>
            <select name="method" defaultValue="cash" className={inputCls}>
              <option value="cash">{labels.methods.cash}</option>
              <option value="card">{labels.methods.card}</option>
              <option value="transfer">{labels.methods.transfer}</option>
              <option value="other">{labels.methods.other}</option>
            </select>
          </Field>

          <Field label={`${labels.amount} (${labels.remaining}: ${formatMoney(remaining, currency, locale)})`}>
            <input
              name="amountMajor"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={(remaining / 100).toFixed(2)}
              required
              className={inputCls + " text-lg font-mono"}
              autoFocus
            />
          </Field>

          <Field label={labels.tip}>
            <input
              name="tipMajor"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0.00"
              className={inputCls + " font-mono"}
            />
          </Field>

          {state.status === "error" && (
            <p className="text-sm text-red-500">{state.message}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-emerald-600 text-white py-3 font-medium disabled:opacity-50"
          >
            {pending ? "..." : labels.confirm}
          </button>
        </form>
      </div>
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

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40";

function PickerRow({
  slug,
  orderId,
  item,
  currency,
  locale,
  labels,
}: {
  slug: string;
  orderId: string;
  item: MenuItem;
  currency: string;
  locale: string;
  labels: Labels;
}) {
  const action = addItemAction.bind(null, slug, orderId);
  const [, formAction, pending] = useActionState(action, {
    status: "idle",
  } as ActionState);

  return (
    <li>
      <form action={formAction} className="flex items-center gap-3 p-4">
        <input type="hidden" name="menuItemId" value={item.id} />
        <input type="hidden" name="qty" value={1} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground">
            {item.station}
          </div>
        </div>
        <div className="font-mono text-sm tabular-nums">
          {formatMoney(item.priceMinor, currency, locale)}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          +
        </button>
      </form>
    </li>
  );
}
