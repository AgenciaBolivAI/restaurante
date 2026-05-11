import postgres from "postgres";
import { requireTenantScope } from "@/server/repos/tenant-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let scope;
  try {
    scope = await requireTenantScope(slug);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "UNAUTHENTICATED") return new Response("Unauthorized", { status: 401 });
    if (msg === "FORBIDDEN") return new Response("Forbidden", { status: 403 });
    return new Response("Bad request", { status: 400 });
  }

  const url = process.env.DATABASE_URL!;
  // Dedicated connection: postgres LISTEN holds the connection open.
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 0 });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unlisten: (() => Promise<void>) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(line: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          /* stream closed */
        }
      }

      // Initial hello
      send("retry: 5000\n");
      send(`event: ready\ndata: ${scope.tenantId}\n\n`);

      // Heartbeat every 25s to keep proxies happy
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);

      try {
        const subscription = await sql.listen("kds_change", (payload) => {
          try {
            const data = JSON.parse(payload);
            if (data.tenantId === scope.tenantId) {
              send(`event: change\ndata: ${Date.now()}\n\n`);
            }
          } catch {
            /* malformed payload */
          }
        });
        unlisten = subscription.unlisten;
      } catch (err) {
        send(
          `event: error\ndata: ${err instanceof Error ? err.message : "listen_failed"}\n\n`,
        );
      }
    },
    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unlisten) await unlisten().catch(() => {});
      await sql.end({ timeout: 1 }).catch(() => {});
    },
  });

  // Also clean up if client aborts
  req.signal.addEventListener("abort", () => {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (unlisten) unlisten().catch(() => {});
    sql.end({ timeout: 1 }).catch(() => {});
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
