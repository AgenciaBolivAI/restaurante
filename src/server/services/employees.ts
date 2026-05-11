"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  users,
  memberships,
  subscriptions,
  plans,
  timeClockEntries,
} from "@/db/schema";
import { requireRole, requireTenantScope } from "@/server/repos/tenant-scope";
import type { ActionState } from "./types";

const ROLES = [
  "owner",
  "manager",
  "waiter",
  "kitchen",
  "bar",
  "cashier",
] as const;

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES),
  pin: z.string().trim().regex(/^\d{4,8}$/).optional().or(z.literal("")),
});

const updateRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(ROLES),
});

const setPinSchema = z.object({
  membershipId: z.string().uuid(),
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

export type EmployeeRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: (typeof ROLES)[number];
  active: boolean;
  hasPin: boolean;
  isClockedIn: boolean;
  clockInIso: string | null;
  joinedAt: string;
};

export type EmployeesPageData = {
  employees: EmployeeRow[];
  plan: {
    code: string;
    name: string;
    maxUserAccounts: number; // 0 = unlimited
  };
  activeCount: number;
  canInvite: boolean;
};

export async function listEmployees(slug: string): Promise<EmployeesPageData> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  // Members + active clock entry (if any)
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      active: memberships.active,
      pinHash: memberships.pinHash,
      joinedAt: memberships.createdAt,
      activeClockIn: timeClockEntries.clockIn,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(
      timeClockEntries,
      and(
        eq(timeClockEntries.userId, memberships.userId),
        eq(timeClockEntries.tenantId, scope.tenantId),
        isNull(timeClockEntries.clockOut),
      ),
    )
    .where(eq(memberships.tenantId, scope.tenantId))
    .orderBy(desc(memberships.active), asc(users.name), asc(users.email));

  // De-dupe (left join with timeclock can yield multiple rows if data race)
  const seen = new Map<string, EmployeeRow>();
  for (const r of rows) {
    if (seen.has(r.membershipId)) continue;
    seen.set(r.membershipId, {
      membershipId: r.membershipId,
      userId: r.userId,
      email: r.email,
      name: r.name,
      role: r.role,
      active: r.active,
      hasPin: !!r.pinHash,
      isClockedIn: !!r.activeClockIn,
      clockInIso: r.activeClockIn?.toISOString() ?? null,
      joinedAt: r.joinedAt.toISOString(),
    });
  }
  const employees = Array.from(seen.values());

  // Current plan (via subscription)
  const [planRow] = await db
    .select({
      code: plans.code,
      name: plans.name,
      maxUserAccounts: plans.maxUserAccounts,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.tenantId, scope.tenantId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const plan = planRow ?? {
    code: "starter",
    name: "Starter",
    maxUserAccounts: 3,
  };

  const activeCount = employees.filter((e) => e.active).length;
  const canInvite = plan.maxUserAccounts === 0 || activeCount < plan.maxUserAccounts;

  return { employees, plan, activeCount, canInvite };
}

export async function inviteEmployeeAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    pin: formData.get("pin") || "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path.includes("password")) {
      return { status: "error", message: "Password must be at least 8 characters" };
    }
    if (issue?.path.includes("pin")) {
      return { status: "error", message: "PIN must be 4–8 digits" };
    }
    if (issue?.path.includes("email")) {
      return { status: "error", message: "Invalid email" };
    }
    return { status: "error", message: "Invalid input" };
  }

  // Plan limit check
  const data = await listEmployees(slug);
  if (!data.canInvite) {
    return {
      status: "error",
      message: `Plan limit reached (${data.plan.maxUserAccounts} accounts). Upgrade to add more.`,
    };
  }

  // Only owners can invite owners; managers can invite everyone except owner
  if (parsed.data.role === "owner" && scope.role !== "owner") {
    return { status: "error", message: "Only the owner can grant owner role" };
  }

  const pinHash = parsed.data.pin
    ? await bcrypt.hash(parsed.data.pin, 10)
    : null;

  await db.transaction(async (tx) => {
    // Find or create user by email
    let userId: string;
    const [existing] = await tx
      .select({ id: users.id, hasPassword: users.passwordHash })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (existing) {
      userId = existing.id;
      // Don't overwrite password if user already has one
    } else {
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const [created] = await tx
        .insert(users)
        .values({
          email: parsed.data.email,
          name: parsed.data.name,
          passwordHash,
          locale: "es",
        })
        .returning({ id: users.id });
      userId = created.id;
    }

    // Check no existing membership
    const [existingMember] = await tx
      .select({ id: memberships.id, active: memberships.active })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, scope.tenantId),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    if (existingMember) {
      // Reactivate if inactive
      if (!existingMember.active) {
        await tx
          .update(memberships)
          .set({ active: true, role: parsed.data.role, pinHash })
          .where(eq(memberships.id, existingMember.id));
      } else {
        throw new Error("ALREADY_MEMBER");
      }
    } else {
      await tx.insert(memberships).values({
        tenantId: scope.tenantId,
        userId,
        role: parsed.data.role,
        pinHash,
      });
    }
  }).catch((e) => {
    if (e instanceof Error && e.message === "ALREADY_MEMBER") {
      throw new Error("This email is already a member of your restaurant");
    }
    throw e;
  });

  revalidatePath(`/[locale]/${slug}/admin/employees`, "page");
  return { status: "ok" };
}

export async function updateRoleAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = updateRoleSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid input" };

  // Can't change own role
  const [m] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, scope.tenantId),
        eq(memberships.id, parsed.data.membershipId),
      ),
    )
    .limit(1);
  if (!m) return { status: "error", message: "Membership not found" };
  if (m.userId === scope.userId) {
    return { status: "error", message: "You cannot change your own role" };
  }
  if (parsed.data.role === "owner" && scope.role !== "owner") {
    return { status: "error", message: "Only the owner can grant owner role" };
  }

  await db
    .update(memberships)
    .set({ role: parsed.data.role })
    .where(eq(memberships.id, parsed.data.membershipId));

  revalidatePath(`/[locale]/${slug}/admin/employees`, "page");
  return { status: "ok" };
}

export async function setMembershipActiveAction(
  slug: string,
  membershipId: string,
  active: boolean,
) {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const [m] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, scope.tenantId),
        eq(memberships.id, membershipId),
      ),
    )
    .limit(1);
  if (!m) return;
  if (m.userId === scope.userId) return; // Can't deactivate self
  if (m.role === "owner") {
    // Make sure at least one active owner remains
    if (!active) {
      const [other] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.tenantId, scope.tenantId),
            eq(memberships.role, "owner"),
            eq(memberships.active, true),
            sql`${memberships.id} != ${membershipId}`,
          ),
        )
        .limit(1);
      if (!other) return; // refuse to deactivate last owner
    }
  }

  await db
    .update(memberships)
    .set({ active })
    .where(eq(memberships.id, membershipId));

  revalidatePath(`/[locale]/${slug}/admin/employees`, "page");
}

export async function setPinAction(
  slug: string,
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await requireTenantScope(slug);
  requireRole(scope, "manager");

  const parsed = setPinSchema.safeParse({
    membershipId: formData.get("membershipId"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) return { status: "error", message: "PIN must be 4–8 digits" };

  const pinHash = await bcrypt.hash(parsed.data.pin, 10);
  await db
    .update(memberships)
    .set({ pinHash })
    .where(
      and(
        eq(memberships.tenantId, scope.tenantId),
        eq(memberships.id, parsed.data.membershipId),
      ),
    );

  revalidatePath(`/[locale]/${slug}/admin/employees`, "page");
  return { status: "ok" };
}
