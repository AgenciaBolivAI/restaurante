import "dotenv/config";
import { db } from "./client";
import { plans } from "./schema";
import { sql } from "drizzle-orm";

type PlanSeed = {
  code: string;
  name: string;
  maxUserAccounts: number;
  maxLocations: number;
  priceMinor: number;
  currency: string;
  features: Record<string, boolean | number | string>;
};

const PLANS: PlanSeed[] = [
  {
    code: "starter",
    name: "Starter",
    maxUserAccounts: 3,
    maxLocations: 1,
    priceMinor: 1900, // $19.00
    currency: "USD",
    features: { reports_basic: true, leaderboard: false, csv_export: false },
  },
  {
    code: "pro",
    name: "Pro",
    maxUserAccounts: 10,
    maxLocations: 1,
    priceMinor: 4900, // $49.00
    currency: "USD",
    features: { reports_basic: true, leaderboard: true, csv_export: true },
  },
  {
    code: "business",
    name: "Business",
    maxUserAccounts: 0, // unlimited
    maxLocations: 5,
    priceMinor: 9900, // $99.00
    currency: "USD",
    features: { reports_basic: true, leaderboard: true, csv_export: true, multi_location: true },
  },
];

async function main() {
  for (const p of PLANS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          name: p.name,
          maxUserAccounts: p.maxUserAccounts,
          maxLocations: p.maxLocations,
          priceMinor: p.priceMinor,
          currency: p.currency,
          features: p.features,
        },
      });
  }
  console.log(`Seeded ${PLANS.length} plans.`);
  await db.execute(sql`SELECT 1`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
