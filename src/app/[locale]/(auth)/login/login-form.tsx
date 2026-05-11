"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginState } from "@/server/auth/actions";

const initial: LoginState = { status: "idle" };

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40";
const labelCls = "block text-sm font-medium mb-1";

export default function LoginForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label className={labelCls} htmlFor="email">
          {t("fields.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="password">
          {t("fields.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className={inputCls}
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-red-500">
          {t(`errors.${state.messageKey}` as `errors.generic`)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground text-background px-4 py-2.5 font-medium disabled:opacity-50"
      >
        {pending ? tCommon("loading") : tCommon("signIn")}
      </button>
    </form>
  );
}
