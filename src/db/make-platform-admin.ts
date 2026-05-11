import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { users } from "./schema";

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error("Usage: tsx src/db/make-platform-admin.ts <email>");
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  await db
    .update(users)
    .set({ isPlatformAdmin: true })
    .where(eq(users.id, user.id));

  console.log(`✓ ${email} is now a platform admin.`);
  console.log("Sign out and back in to refresh your session JWT.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
