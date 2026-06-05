const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('Applying migration: add_message_color_fields...');
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Property" 
      ADD COLUMN IF NOT EXISTS "leftMessageBackgroundColor" TEXT,
      ADD COLUMN IF NOT EXISTS "leftMessageTextColor" TEXT,
      ADD COLUMN IF NOT EXISTS "rightMessageBackgroundColor" TEXT,
      ADD COLUMN IF NOT EXISTS "rightMessageTextColor" TEXT;
    `);
    
    console.log('✅ Migration applied successfully!');
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();

