"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { menuCategories, menuItems } from "@/db/schema";
import { requireTenantScope, requireRole } from "@/server/repos/tenant-scope";
import type { ActionState } from "./types";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().optional().nullable(),
  priceMajor: z.coerce.number().min(0).max(10_000),
  station: z.enum(["kitchen", "bar", "both", "none"]).default("kitchen"),
  taxRateId: z.string().uuid().optional().nullable(),
});

export async function listMenu(slug: string) {
  const scope = await requireTenantScope(slug);
  const [cats, items] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.tenantId, scope.tenantId),
          eq(menuCategories.archived, false),
        ),
      )
      .orderBy(menuCategories.sortOrder, menuCategories.name),
    db
      .select()
      .from(menuItems)
      .where(
        and(eq(menuItems.tenantId, scope.tenantId), eq(menuItems.archived, false)),
      )
      .orderBy(asc(menuItems.name)),
  ]);
  return { categories: cats, items };
}

export async function createCategoryAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { status: "error", message: "Invalid name" };

  await db.insert(menuCategories).values({
    tenantId: scope.tenantId,
    name: parsed.data.name,
  });
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
  return { status: "ok" };
}

const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});

export async function updateCategoryAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = updateCategorySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  await db
    .update(menuCategories)
    .set({ name: parsed.data.name })
    .where(
      and(
        eq(menuCategories.tenantId, scope.tenantId),
        eq(menuCategories.id, parsed.data.id),
      ),
    );
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
  return { status: "ok" };
}

export async function deleteCategoryAction(slug: string, id: string) {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");
  await db
    .update(menuCategories)
    .set({ archived: true })
    .where(
      and(eq(menuCategories.tenantId, scope.tenantId), eq(menuCategories.id, id)),
    );
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
}

export async function createItemAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const raw = {
    name: formData.get("name"),
    categoryId: formData.get("categoryId") || null,
    priceMajor: formData.get("priceMajor"),
    station: formData.get("station") || "kitchen",
    taxRateId: formData.get("taxRateId") || null,
  };
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "Invalid input" };
  }

  await db.insert(menuItems).values({
    tenantId: scope.tenantId,
    categoryId: parsed.data.categoryId || null,
    name: parsed.data.name,
    priceMinor: Math.round(parsed.data.priceMajor * 100),
    station: parsed.data.station,
    taxRateId: parsed.data.taxRateId || null,
  });
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
  return { status: "ok" };
}

const updateItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().optional().nullable(),
  priceMajor: z.coerce.number().min(0).max(10_000),
  station: z.enum(["kitchen", "bar", "both", "none"]).default("kitchen"),
  taxRateId: z.string().uuid().optional().nullable(),
});

export async function updateItemAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = updateItemSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    categoryId: formData.get("categoryId") || null,
    priceMajor: formData.get("priceMajor"),
    station: formData.get("station") || "kitchen",
    taxRateId: formData.get("taxRateId") || null,
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  await db
    .update(menuItems)
    .set({
      name: parsed.data.name,
      categoryId: parsed.data.categoryId || null,
      priceMinor: Math.round(parsed.data.priceMajor * 100),
      station: parsed.data.station,
      taxRateId: parsed.data.taxRateId || null,
    })
    .where(
      and(
        eq(menuItems.tenantId, scope.tenantId),
        eq(menuItems.id, parsed.data.id),
      ),
    );
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
  return { status: "ok" };
}

export async function deleteItemAction(slug: string, id: string) {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");
  await db
    .update(menuItems)
    .set({ archived: true })
    .where(and(eq(menuItems.tenantId, scope.tenantId), eq(menuItems.id, id)));
  revalidatePath(`/[locale]/${slug}/admin/menu`, "page");
}
