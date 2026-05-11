"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";
import { requireRole, requireTenantScope } from "@/server/repos/tenant-scope";
import { routing } from "@/i18n/routing";
import type { ActionState } from "./types";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().toUpperCase().length(3),
  timezone: z.string().trim().min(1).max(60),
  locale: z.enum(routing.locales),
  address: z.string().trim().max(300).optional().nullable(),
  receiptFooter: z.string().trim().max(300).optional().nullable(),
});

export async function getTenantSettings(slug: string) {
  const scope = await requireTenantScope(slug);
  const [t] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, scope.tenantId))
    .limit(1);
  return t;
}

export async function updateTenantSettingsAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "owner");

  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    locale: formData.get("locale"),
    address: (formData.get("address") as string) || null,
    receiptFooter: (formData.get("receiptFooter") as string) || null,
  });
  if (!parsed.success) {
    return { status: "error", message: "Invalid input" };
  }

  // Validate currency exists (basic check via Intl)
  try {
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: parsed.data.currency,
    }).format(0);
  } catch {
    return { status: "error", message: `Unknown currency: ${parsed.data.currency}` };
  }

  // Validate timezone
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return { status: "error", message: `Unknown timezone: ${parsed.data.timezone}` };
  }

  await db
    .update(tenants)
    .set({
      name: parsed.data.name,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      address: parsed.data.address || null,
      receiptFooter: parsed.data.receiptFooter || null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, scope.tenantId));

  revalidatePath(`/[locale]/${slug}`, "layout");
  return { status: "ok" };
}
