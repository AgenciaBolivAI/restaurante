"use client";

import { useActionState } from "react";
import { useRouter } from "@/i18n/navigation";
import { openOrUseTableOrder } from "@/server/services/orders";
import type { ActionState } from "@/server/services/types";

const initial: ActionState = { status: "idle" };

type Table = {
  id: string;
  number: number;
  seats: number;
  area: string | null;
  openOrderId: string | null;
  openSeq: number | null;
};

type ToGo = { id: string; sequenceNo: number; openedAt: string };

export default function PosGrid({
  slug,
  labels,
  tables,
  togoOpen,
}: {
  slug: string;
  currency: string;
  labels: {
    tables: string;
    newToGo: string;
    togoOpen: string;
    empty: string;
    seats: string;
  };
  tables: Table[];
  togoOpen: ToGo[];
}) {
  const router = useRouter();
  const action = openOrUseTableOrder.bind(null, slug);
  const [, formAction, pending] = useActionState(action, initial);

  return (
    <div className="space-y-8">
      {/* TO-GO actions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            {labels.togoOpen}
          </h2>
          <form action={formAction}>
            <input type="hidden" name="orderType" value="to_go" />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              + {labels.newToGo}
            </button>
          </form>
        </div>
        {togoOpen.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {togoOpen.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => router.push(`/${slug}/pos/orders/${t.id}`)}
                  className="w-full text-left p-3 rounded-md border border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                >
                  <div className="text-xs uppercase text-amber-600 dark:text-amber-400">
                    TO-GO
                  </div>
                  <div className="font-mono font-semibold">#{t.sequenceNo}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Table grid */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">
          {labels.tables}
        </h2>
        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {tables.map((tbl) => (
              <li key={tbl.id}>
                <form action={formAction}>
                  <input type="hidden" name="tableId" value={tbl.id} />
                  <input type="hidden" name="orderType" value="dine_in" />
                  <button
                    type="submit"
                    disabled={pending}
                    className={
                      "w-full aspect-square rounded-md border-2 flex flex-col items-center justify-center gap-0.5 transition-colors disabled:opacity-50 " +
                      (tbl.openOrderId
                        ? "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : "border-foreground/15 hover:bg-foreground/5")
                    }
                  >
                    <div className="text-2xl font-semibold">#{tbl.number}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {tbl.seats} {labels.seats}
                    </div>
                    {tbl.openOrderId && (
                      <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                        #{tbl.openSeq}
                      </div>
                    )}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
