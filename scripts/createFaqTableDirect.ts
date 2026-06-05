import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function createFAQTable() {
  try {
    console.log("Creating FAQ table...");
    
    // Create table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FAQ" (
        "id" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "propertyId" TEXT NOT NULL,
        "question" TEXT NOT NULL,
        "answer" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log("✓ Table created");

    // Create indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FAQ_companyId_idx" ON "FAQ"("companyId")`);
    console.log("✓ Index FAQ_companyId_idx created");
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FAQ_propertyId_idx" ON "FAQ"("propertyId")`);
    console.log("✓ Index FAQ_propertyId_idx created");
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FAQ_isActive_idx" ON "FAQ"("isActive")`);
    console.log("✓ Index FAQ_isActive_idx created");
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FAQ_propertyId_isActive_idx" ON "FAQ"("propertyId", "isActive")`);
    console.log("✓ Index FAQ_propertyId_isActive_idx created");

    // Add foreign keys
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FAQ_companyId_fkey'
        ) THEN
          ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_companyId_fkey" 
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log("✓ Foreign key FAQ_companyId_fkey created");
    
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FAQ_propertyId_fkey'
        ) THEN
          ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_propertyId_fkey" 
          FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log("✓ Foreign key FAQ_propertyId_fkey created");

    // Verify table exists
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'FAQ'
    `;
    
    if (result.length > 0) {
      console.log("\n✓ FAQ table successfully created and verified!");
    } else {
      console.log("\n✗ FAQ table creation may have failed - table not found");
    }
    
  } catch (error: any) {
    console.error("Error creating FAQ table:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createFAQTable();

