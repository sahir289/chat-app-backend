import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function applyIsDeletedMigration() {
  try {
    console.log("Checking if isDeleted column exists...");
    
    // Check if column exists
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Message' 
      AND column_name = 'isDeleted'
    `;

    if (result.length > 0) {
      console.log("✓ isDeleted column already exists!");
      return;
    }

    console.log("Applying isDeleted migration...");
    
    // Read and execute the migration SQL
    const migrationPath = path.join(__dirname, "../prisma/migrations/manualAddIsDeletedToMessage.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    // Split SQL into individual statements and execute them one by one
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
    
    console.log("✓ Migration applied successfully!");
    console.log("\n✅ isDeleted field added to Message table!");
  } catch (error) {
    console.error("Error applying migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyIsDeletedMigration();

