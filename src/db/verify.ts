import "dotenv/config";
import { db } from "./client";
import { plans } from "./schema";
import { sql } from "drizzle-orm";

async function main() {
  const tableCountRows = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema='public'`,
  );
  const tableCount = tableCountRows[0]?.count ?? "?";

  const enumCountRows = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM pg_type WHERE typtype='e'`,
  );
  const enumCount = enumCountRows[0]?.count ?? "?";

  const planRows = await db.select().from(plans).orderBy(plans.priceMinor);

  console.log(`Tables in public schema: ${tableCount}`);
  console.log(`Enum types: ${enumCount}`);
  console.log(`Plans seeded: ${planRows.length}`);
  for (const p of planRows) {
    console.log(
      `  - ${p.code.padEnd(10)} ${p.name.padEnd(10)} ${p.maxUserAccounts === 0 ? "unlimited" : p.maxUserAccounts} users  $${(p.priceMinor / 100).toFixed(2)} ${p.currency}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
