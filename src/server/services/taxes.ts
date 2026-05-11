"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { taxRates, menuItems } from "@/db/schema";
import { requireRole, requireTenantScope } from "@/server/repos/tenant-scope";
import type { ActionState } from "./types";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  percent: z.coerce.number().min(0).max(99.99),
  inclusive: z.coerce.boolean().default(false),
});

export async function listTaxRates(slug: string) {
  const scope = await requireTenantScope(slug);
  return db
    .select()
    .from(taxRates)
    .where(eq(taxRates.tenantId, scope.tenantId))
    .orderBy(asc(taxRates.name));
}

export async function createTaxRateAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    percent: formData.get("percent"),
    inclusive: formData.get("inclusive") === "on" || formData.get("inclusive") === "true",
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  await db.insert(taxRates).values({
    tenantId: scope.tenantId,
    name: parsed.data.name,
    bps: Math.round(parsed.data.percent * 100), // 7.5% → 750 bps
    inclusive: parsed.data.inclusive,
  });

  revalidatePath(`/[locale]/${slug}/admin/taxes`, "page");
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
  return { status: "ok" };
}

export async function deleteTaxRateAction(slug: string, id: string) {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  await db.transaction(async (tx) => {
    // Detach from any menu items first (set to null)
    await tx
      .update(menuItems)
      .set({ taxRateId: null })
      .where(
        and(eq(menuItems.tenantId, scope.tenantId), eq(menuItems.taxRateId, id)),
      );
    await tx
      .delete(taxRates)
      .where(and(eq(taxRates.tenantId, scope.tenantId), eq(taxRates.id, id)));
  });

  revalidatePath(`/[locale]/${slug}/admin/taxes`, "page");
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
}

