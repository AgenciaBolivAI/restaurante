"use client";

import { useEffect, useState, useTransition } from "react";
import { listStationTickets, markItemReadyAction, markItemUnreadyAction, type KdsTicket, type Station } from "@/server/services/kds";

const FALLBACK_POLL_MS = 15_000; // safety net if SSE drops

type Labels = {
  title: string;
  empty: string;
  table: string;
  togo: string;
  ready: string;
  unready: string;
  elapsedMin: string;
  elapsedSec: string;
};

export default function KdsBoard({
  slug,
  station,
  labels,
  initial,
}: {
  slug: string;
  station: Station;
  labels: Labels;
  initial: KdsTicket[];
}) {
  const [tickets, setTickets] = useState<KdsTicket[]>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);

  // Realtime via SSE; fallback poll every 15s in case the connection drops or NOTIFY misses something.
  useEffect(() => {
    let cancelled = false;

    async function refetch() {
      try {
        const next = await listStationTickets(slug, station);
        if (!cancelled) setTickets(next);
      } catch {
        /* swallow; next tick will retry */
      }
    }

    const es = new EventSource(`/api/kds/${slug}/stream`);
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("change", () => {
      void refetch();
    });
    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects; nothing to do
    };

    const interval = setInterval(refetch, FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      es.close();
    };
  }, [slug, station]);

  // Tick clock for elapsed time
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-3 border-b border-foreground/10 flex items-center justify-between">
        <h1 className="text-xl font-semibold uppercase tracking-wide flex items-center gap-2">
          {labels.title}
          <span
            className={
              "inline-block w-2 h-2 rounded-full " +
              (connected ? "bg-emerald-500" : "bg-amber-500 animate-pulse")
            }
            title={connected ? "live" : "reconnecting"}
          />
        </h1>
        <div className="text-xs text-muted-foreground">
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
        </div>
      </header>

      {tickets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-lg">
          {labels.empty}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {tickets.map((t) => (
              <Ticket
                key={t.orderId}
                slug={slug}
                ticket={t}
                now={now}
                labels={labels}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function elapsedColor(ms: number): string {
  // < 5min: green, 5-10min: amber, > 10min: red
  if (ms < 5 * 60_000) return "border-emerald-500/60 bg-emerald-500/5";
  if (ms < 10 * 60_000) return "border-amber-500/60 bg-amber-500/10";
  return "border-red-500/70 bg-red-500/10";
}

function fmtElapsed(ms: number, labels: Labels): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}${labels.elapsedSec}`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}${labels.elapsedMin}${remSec.toString().padStart(2, "0")}`;
}

function Ticket({
  slug,
  ticket,
  now,
  labels,
}: {
  slug: string;
  ticket: KdsTicket;
  now: number;
  labels: Labels;
}) {
  const fired = ticket.oldestFiredAt ? new Date(ticket.oldestFiredAt).getTime() : null;
  const elapsedMs = fired ? now - fired : 0;
  const colorCls = fired ? elapsedColor(elapsedMs) : "border-foreground/15";

  const allReady = ticket.items.every((i) => i.kdsStatus === "ready");

  return (
    <div
      className={`rounded-lg border-2 p-3 flex flex-col ${colorCls} ${allReady ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">
          {ticket.tableNumber !== null ? (
            <>
              {labels.table} <span className="font-mono">#{ticket.tableNumber}</span>
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">{labels.togo}</span>
          )}
        </div>
        <div className="font-mono text-sm text-muted-foreground">
          #{ticket.sequenceNo}
        </div>
      </div>

      {fired && (
        <div className="text-xs font-mono text-muted-foreground mb-2">
          ⏱ {fmtElapsed(elapsedMs, labels)}
        </div>
      )}

      <ul className="space-y-1 mb-2">
        {ticket.items.map((it) => (
          <ItemRow key={it.id} slug={slug} item={it} labels={labels} />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({
  slug,
  item,
  labels,
}: {
  slug: string;
  item: KdsTicket["items"][number];
  labels: Labels;
}) {
  const [pending, startTransition] = useTransition();
  const isReady = item.kdsStatus === "ready";

  return (
    <li className="flex items-start gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            if (isReady) {
              await markItemUnreadyAction(slug, item.id);
            } else {
              await markItemReadyAction(slug, item.id);
            }
          })
        }
        disabled={pending}
        title={isReady ? labels.unready : labels.ready}
        className={
          "shrink-0 w-6 h-6 rounded border-2 mt-0.5 flex items-center justify-center text-xs " +
          (isReady
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-foreground/40 hover:bg-foreground/10")
        }
      >
        {isReady ? "✓" : ""}
      </button>
      <div className={"flex-1 min-w-0 " + (isReady ? "line-through opacity-60" : "")}>
        <div className="font-medium">
          <span className="font-mono mr-1">{item.qty}×</span>
          {item.name}
        </div>
        {item.notes && (
          <div className="text-xs italic text-muted-foreground">
            {item.notes}
          </div>
        )}
      </div>
    </li>
  );
}
