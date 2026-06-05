"use strict";
/**
 * Script to add hasUsedFreeExport field to Company table
 * Run with: npx ts-node scripts/addFreeExportTracking.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function addFreeExportTracking() {
    try {
        console.log('Adding hasUsedFreeExport column to Company table...');
        // Check if column already exists
        const columnExists = await prisma.$queryRawUnsafe(`SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'Company' AND column_name = 'hasUsedFreeExport'`);
        if (columnExists.length > 0) {
            console.log('✅ Column hasUsedFreeExport already exists');
            return;
        }
        // Add the column
        await prisma.$executeRawUnsafe(`
      ALTER TABLE "Company" 
      ADD COLUMN IF NOT EXISTS "hasUsedFreeExport" BOOLEAN NOT NULL DEFAULT false;
    `);
        console.log('✅ Column hasUsedFreeExport added successfully!');
        // Verify column exists
        const verify = await prisma.$queryRawUnsafe(`SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'Company' AND column_name = 'hasUsedFreeExport'`);
        if (verify.length > 0) {
            console.log('✅ Column verified: hasUsedFreeExport');
        }
        else {
            console.log('⚠️  Warning: Column may not have been created');
        }
    }
    catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
addFreeExportTracking();
