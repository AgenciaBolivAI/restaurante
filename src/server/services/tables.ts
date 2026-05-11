"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tables } from "@/db/schema";
import { requireTenantScope, requireRole } from "@/server/repos/tenant-scope";
import type { ActionState } from "./types";

const createSchema = z.object({
  number: z.coerce.number().int().min(1).max(9999),
  seats: z.coerce.number().int().min(1).max(50).default(2),
  area: z.string().trim().max(40).optional().nullable(),
});

export async function listTables(slug: string) {
  const scope = await requireTenantScope(slug);
  return db
    .select()
    .from(tables)
    .where(
      and(eq(tables.tenantId, scope.tenantId), eq(tables.locationId, scope.locationId)),
    )
    .orderBy(tables.number);
}

export async function createTableAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = createSchema.safeParse({
    number: formData.get("number"),
    seats: formData.get("seats"),
    area: formData.get("area") || null,
  });
  if (!parsed.success) {
    return { status: "error", message: "Invalid input" };
  }

  try {
    await db.insert(tables).values({
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      number: parsed.data.number,
      seats: parsed.data.seats,
      area: parsed.data.area || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    if (msg.includes("tables_tenant_location_number_uq")) {
      return { status: "error", message: `Table ${parsed.data.number} already exists` };
    }
    return { status: "error", message: "Failed to create table" };
  }

  revalidatePath(`/[locale]/${slug}/admin/tables`, "page");
  return { status: "ok" };
}

export async function deleteTableAction(slug: string, tableId: string) {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  await db
    .delete(tables)
    .where(and(eq(tables.tenantId, scope.tenantId), eq(tables.id, tableId)));

  revalidatePath(`/[locale]/${slug}/admin/tables`, "page");
}
