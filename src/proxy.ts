import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all paths except: API routes, Next internals, static assets, files with extension
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
