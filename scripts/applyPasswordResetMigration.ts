import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log("Checking if password reset columns exist...");
    
    // Check if columns exist by trying to query them
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND column_name IN ('passwordResetToken', 'passwordResetExpires')
    `;

    const existingColumns = result.map(r => r.column_name);
    console.log("Existing columns:", existingColumns);

    if (existingColumns.includes("passwordResetToken") && existingColumns.includes("passwordResetExpires")) {
      console.log("✓ Password reset columns already exist!");
      return;
    }

    console.log("Applying migration...");
    
    // Read and execute the migration SQL
    const migrationPath = path.join(__dirname, "../prisma/migrations/manualAddPasswordResetFields.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    await prisma.$executeRawUnsafe(sql);
    
    console.log("✓ Migration applied successfully!");
  } catch (error) {
    console.error("Error applying migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();

