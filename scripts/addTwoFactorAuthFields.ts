/**
 * Script to add Two-Factor Authentication (2FA) fields to User table
 * Run with: npx ts-node scripts/addTwoFactorAuthFields.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function addTwoFactorAuthFields() {
  try {
    console.log("Checking if 2FA columns exist...");
    
    // Check if columns exist by trying to query them
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND column_name IN ('twoFactorEnabled', 'twoFactorSecret', 'twoFactorBackupCodes')
    `;

    const existingColumns = result.map(r => r.column_name);
    console.log("Existing columns:", existingColumns);

    if (existingColumns.includes("twoFactorEnabled") && 
        existingColumns.includes("twoFactorSecret") && 
        existingColumns.includes("twoFactorBackupCodes")) {
      console.log("✓ 2FA columns already exist!");
      return;
    }

    console.log("Applying migration...");
    
    // Read and execute the migration SQL
    const migrationPath = path.join(__dirname, "../prisma/migrations/manualAddTwoFactorAuth.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    await prisma.$executeRawUnsafe(sql);
    
    console.log("✓ Migration applied successfully!");
    console.log("\n✅ Two-Factor Authentication fields added to User table!");
    console.log("   - twoFactorEnabled (BOOLEAN, default: false)");
    console.log("   - twoFactorSecret (TEXT, nullable)");
    console.log("   - twoFactorBackupCodes (TEXT[], default: [])");
  } catch (error) {
    console.error("Error applying migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addTwoFactorAuthFields();

