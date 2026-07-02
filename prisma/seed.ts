// Seeds the database with fictional demo data.
// Run with: npm run db:seed   (or npm run db:reset to wipe + reseed)
import { PrismaClient } from "@prisma/client";
import { seedClinic } from "../src/lib/seed-clinic";

const prisma = new PrismaClient();

seedClinic(prisma)
  .then((counts) => console.log("Seeded:", counts))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
