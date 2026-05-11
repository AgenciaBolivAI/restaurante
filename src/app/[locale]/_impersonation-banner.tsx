import { getImpersonationBannerData } from "@/server/auth/impersonation";
import { stopImpersonationAction } from "@/server/auth/impersonation-actions";

export default async function ImpersonationBanner() {
  const data = await getImpersonationBannerData();
  if (!data) return null;

  return (
    <div className="bg-red-600 text-white text-sm sticky top-0 z-50 px-4 py-2 flex items-center justify-between gap-3">
      <div className="truncate">
        <span className="font-bold uppercase tracking-wider mr-2">
          Impersonating
        </span>
        <span className="font-mono">
          {data.asName ?? data.asEmail}
        </span>
        <span className="opacity-70 ml-2 text-xs">
          (as {data.realName ?? data.realEmail})
        </span>
      </div>
      <form action={stopImpersonationAction}>
        <button
          type="submit"
          className="px-3 py-1 rounded bg-white/15 hover:bg-white/25 text-xs font-semibold whitespace-nowrap"
        >
          Stop
        </button>
      </form>
    </div>
  );
}
