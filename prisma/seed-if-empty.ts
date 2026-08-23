// Boot-time seeding for hosted demo deployments (see README "Deploying a demo").
// seedClinic() wipes every table, so it must only run when the database is
// still empty — otherwise every container restart would discard whatever the
// people trying the demo entered. Safe to run on every start.
import { PrismaClient } from "@prisma/client";
import { seedClinic } from "../src/lib/seed-clinic";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`[seed-if-empty] database already populated (${users} staff accounts) — skipping.`);
    return;
  }
  console.log("[seed-if-empty] empty database — seeding demo data...");
  const counts = await seedClinic(prisma);
  console.log("[seed-if-empty] seeded:", counts);
}

main()
  .catch((e) => {
    console.error("[seed-if-empty] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
