"use client";

import { useEffect, useState, useTransition } from "react";
import { clockInAction, clockOutAction } from "@/server/services/timeclock";

type Labels = { clockIn: string; clockOut: string };

function fmtElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export default function ClockButton({
  slug,
  activeSinceIso,
  labels,
}: {
  slug: string;
  activeSinceIso: string | null;
  labels: Labels;
}) {
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeSinceIso) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [activeSinceIso]);

  if (activeSinceIso) {
    const elapsed = now - new Date(activeSinceIso).getTime();
    return (
      <button
        onClick={() => startTransition(async () => clockOutAction(slug))}
        disabled={pending}
        className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 disabled:opacity-50"
        title={labels.clockOut}
      >
        ⏱ {fmtElapsed(elapsed)}
      </button>
    );
  }

  return (
    <button
      onClick={() => startTransition(async () => clockInAction(slug))}
      disabled={pending}
      className="text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
    >
      {labels.clockIn}
    </button>
  );
}
