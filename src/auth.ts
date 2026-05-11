import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { users, memberships, tenants } from "./db/schema";

type TenantRef = { id: string; slug: string; role: string };

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isPlatformAdmin: boolean;
      tenants: TenantRef[];
    } & DefaultSession["user"];
  }
}

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      const t = token as typeof token & {
        uid?: string;
        isPlatformAdmin?: boolean;
        tenants?: TenantRef[];
      };

      if (user?.id) t.uid = user.id;

      if (
        t.uid &&
        (trigger === "signIn" || trigger === "update" || !t.tenants)
      ) {
        const [u] = await db
          .select({ isPlatformAdmin: users.isPlatformAdmin })
          .from(users)
          .where(eq(users.id, t.uid))
          .limit(1);
        t.isPlatformAdmin = !!u?.isPlatformAdmin;

        const rows = await db
          .select({
            id: tenants.id,
            slug: tenants.slug,
            role: memberships.role,
          })
          .from(memberships)
          .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
          .where(eq(memberships.userId, t.uid));
        t.tenants = rows;
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & {
        uid?: string;
        isPlatformAdmin?: boolean;
        tenants?: TenantRef[];
      };
      if (t.uid) {
        session.user.id = t.uid;
        session.user.isPlatformAdmin = !!t.isPlatformAdmin;
        session.user.tenants = t.tenants ?? [];
      }
      return session;
    },
  },
});
