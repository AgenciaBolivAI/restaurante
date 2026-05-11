"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signupAction, type SignupState } from "@/server/auth/actions";

const initial: SignupState = { status: "idle" };

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-foreground/40";
const labelCls = "block text-sm font-medium mb-1";

export default function SignupForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(signupAction, initial);
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label className={labelCls} htmlFor="restaurantName">
          {t("fields.restaurantName")}
        </label>
        <input
          id="restaurantName"
          name="restaurantName"
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="name">
          {t("fields.name")}
        </label>
        <input id="name" name="name" required className={inputCls} />
      </div>

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
          minLength={8}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="currency">
            {t("fields.currency")}
          </label>
          <input
            id="currency"
            name="currency"
            defaultValue="USD"
            maxLength={3}
            className={inputCls + " uppercase"}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="timezone">
            {t("fields.timezone")}
          </label>
          <input
            id="timezone"
            name="timezone"
            defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            className={inputCls}
          />
        </div>
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
        {pending ? tCommon("loading") : tCommon("signUp")}
      </button>
    </form>
  );
}
