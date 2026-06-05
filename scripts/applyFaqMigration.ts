import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function applyFAQMigration() {
  try {
    console.log("Checking if FAQ table exists...");
    
    // Check if table exists
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'FAQ'
    `;

    if (result.length > 0) {
      console.log("✓ FAQ table already exists!");
      return;
    }

    console.log("Applying FAQ migration...");
    
    // Read and execute the migration SQL
    const migrationPath = path.join(__dirname, "../prisma/migrations/20260130125437_add_faq_table/migration.sql");
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
    
    console.log("✓ FAQ migration applied successfully!");
  } catch (error) {
    console.error("Error applying FAQ migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyFAQMigration();

