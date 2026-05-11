"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  users,
  tenants,
  memberships,
  locations,
  plans,
  subscriptions,
} from "@/db/schema";
import { signIn, signOut } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  restaurantName: z.string().trim().min(1).max(120),
  currency: z.string().trim().toUpperCase().length(3).default("USD"),
  timezone: z.string().trim().min(1).default("UTC"),
  locale: z.enum(routing.locales).default(routing.defaultLocale),
});

export type SignupState =
  | { status: "idle" }
  | { status: "error"; messageKey: string }
  | { status: "ok" };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "restaurant";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    if (!existing) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    restaurantName: formData.get("restaurantName"),
    currency: formData.get("currency") || "USD",
    timezone: formData.get("timezone") || "UTC",
    locale: formData.get("locale") || routing.defaultLocale,
  });

  if (!parsed.success) {
    const err = parsed.error.issues[0];
    if (err?.path.includes("password")) {
      return { status: "error", messageKey: "weakPassword" };
    }
    return { status: "error", messageKey: "generic" };
  }

  const data = parsed.data;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);
  if (existingUser) {
    return { status: "error", messageKey: "emailTaken" };
  }

  const [starter] = await db
    .select()
    .from(plans)
    .where(eq(plans.code, "starter"))
    .limit(1);
  if (!starter) {
    return { status: "error", messageKey: "generic" };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const slug = await uniqueSlug(slugify(data.restaurantName));
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        passwordHash,
        locale: data.locale,
      })
      .returning({ id: users.id });

    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug,
        name: data.restaurantName,
        currency: data.currency,
        locale: data.locale,
        timezone: data.timezone,
        status: "trial",
        trialEndsAt,
      })
      .returning({ id: tenants.id });

    await tx.insert(locations).values({
      tenantId: tenant.id,
      name: data.restaurantName,
    });

    await tx.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });

    await tx.insert(subscriptions).values({
      tenantId: tenant.id,
      planId: starter.id,
      status: "trialing",
      provider: "manual",
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
    });
  });

  await signIn("credentials", {
    email: data.email,
    password: data.password,
    redirect: false,
  });

  redirect({ href: `/${slug}/admin`, locale: data.locale as Locale });
  return { status: "ok" };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  locale: z.enum(routing.locales).default(routing.defaultLocale),
});

export type LoginState =
  | { status: "idle" }
  | { status: "error"; messageKey: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    locale: formData.get("locale") || routing.defaultLocale,
  });
  if (!parsed.success) {
    return { status: "error", messageKey: "invalidCredentials" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch {
    return { status: "error", messageKey: "invalidCredentials" };
  }

  // Find a tenant for this user; if none, send to a "no tenant" page (not built yet → /).
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (user) {
    const [m] = await db
      .select({ slug: tenants.slug })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, user.id))
      .limit(1);
    if (m) {
      redirect({ href: `/${m.slug}/admin`, locale: parsed.data.locale });
    }
  }
  redirect({ href: "/", locale: parsed.data.locale });
  return { status: "idle" };
}

export async function signOutAction(locale: Locale = routing.defaultLocale) {
  await signOut({ redirect: false });
  redirect({ href: "/", locale });
}
