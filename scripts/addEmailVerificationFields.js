"use strict";
/**
 * Script to add email verification fields to User table
 * Run with: npx ts-node scripts/addEmailVerificationFields.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../src/lib/prisma"));
async function addEmailVerificationFields() {
    try {
        console.log("Adding email verification fields to User table...");
        // Add email verification fields
        await prisma_1.default.$executeRawUnsafe(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT,
      ADD COLUMN IF NOT EXISTS "emailVerificationExpires" TIMESTAMP(3);
    `);
        console.log("✓ Added email verification columns");
        // Create indexes
        await prisma_1.default.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "User_emailVerified_idx" ON "User"("emailVerified");
    `);
        await prisma_1.default.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "User_emailVerificationToken_idx" 
      ON "User"("emailVerificationToken") 
      WHERE "emailVerificationToken" IS NOT NULL;
    `);
        console.log("✓ Created indexes");
        // Update existing users to have emailVerified = true (for backward compatibility)
        await prisma_1.default.$executeRawUnsafe(`
      UPDATE "User" 
      SET "emailVerified" = true 
      WHERE "emailVerified" = false;
    `);
        console.log("✓ Updated existing users (set emailVerified = true for backward compatibility)");
        console.log("\n✅ Email verification fields added successfully!");
        console.log("\nNote: Existing users have been set to emailVerified = true.");
        console.log("New registrations will require email verification.");
    }
    catch (error) {
        if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
            console.log("✓ Columns already exist, skipping...");
            console.log("✅ Migration already applied!");
        }
        else {
            console.error("❌ Error adding email verification fields:", error.message);
            throw error;
        }
    }
    finally {
        await prisma_1.default.$disconnect();
    }
}
addEmailVerificationFields()
    .catch((error) => {
    console.error("Failed to add email verification fields:", error);
    process.exit(1);
});
