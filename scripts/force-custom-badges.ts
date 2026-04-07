import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Force-enabling useCustomBadge for all events...');
  const result = await prisma.event.updateMany({
    data: {
      useCustomBadge: true
    }
  });
  console.log(`Updated ${result.count} events.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
