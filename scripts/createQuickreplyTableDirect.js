"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function createQuickReplyTable() {
    try {
        console.log("Creating QuickReply table...");
        // Create table
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuickReply" (
        "id" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "propertyId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
      )
    `);
        console.log("✓ Table created");
        // Create indexes
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuickReply_companyId_idx" ON "QuickReply"("companyId")`);
        console.log("✓ Index QuickReply_companyId_idx created");
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuickReply_propertyId_idx" ON "QuickReply"("propertyId")`);
        console.log("✓ Index QuickReply_propertyId_idx created");
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuickReply_isActive_idx" ON "QuickReply"("isActive")`);
        console.log("✓ Index QuickReply_isActive_idx created");
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuickReply_propertyId_isActive_idx" ON "QuickReply"("propertyId", "isActive")`);
        console.log("✓ Index QuickReply_propertyId_isActive_idx created");
        // Add foreign keys
        await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'QuickReply_companyId_fkey'
        ) THEN
          ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_companyId_fkey" 
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
        console.log("✓ Foreign key QuickReply_companyId_fkey created");
        await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'QuickReply_propertyId_fkey'
        ) THEN
          ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_propertyId_fkey" 
          FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
        console.log("✓ Foreign key QuickReply_propertyId_fkey created");
        // Verify table exists
        const result = await prisma.$queryRaw `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'QuickReply'
    `;
        if (result.length > 0) {
            console.log("\n✓ QuickReply table successfully created and verified!");
        }
        else {
            console.log("\n✗ QuickReply table creation may have failed - table not found");
        }
    }
    catch (error) {
        console.error("Error creating QuickReply table:", error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
createQuickReplyTable();
