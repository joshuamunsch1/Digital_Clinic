// Remove ALL simulated patients (the synthetic reference cohort + scripted
// active demo patients) — the cutover step once enough real completed
// treatments have accumulated. Cascades take responses, scale scores,
// session logs and invitations along; demo and real patients are untouched.
// Usage: npm run sim:purge
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.patient.count({ where: { simulated: true } });
  const { count } = await prisma.patient.deleteMany({ where: { simulated: true } });
  const remaining = await prisma.patient.count();
  console.log(`Purged ${count} of ${before} simulated patients; ${remaining} patients remain.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
