const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addLogoColumn() {
  try {
    console.log('Adding logo column to Company table...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Company" 
      ADD COLUMN IF NOT EXISTS "logo" TEXT;
    `);
    console.log('✅ Successfully added logo column to Company table');
  } catch (error) {
    console.error('❌ Error adding logo column:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addLogoColumn();

