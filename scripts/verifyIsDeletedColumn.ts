import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyIsDeletedColumn() {
  try {
    console.log("Checking if isDeleted column exists in Message table...");
    
    // Check if column exists (case-sensitive check)
    const result = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'Message' 
       AND column_name = 'isDeleted'`
    );

    if (result.length > 0) {
      console.log("✅ isDeleted column exists!");
      
      // Check the column details
      const columnDetails = await prisma.$queryRawUnsafe<Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns 
         WHERE table_name = 'Message' 
         AND column_name = 'isDeleted'`
      );
      
      console.log("Column details:", columnDetails[0]);
      
      // Try a test query
      try {
        const testResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*) as count FROM "Message" WHERE "isDeleted" = false`
        );
        console.log(`✅ Test query successful. Messages with isDeleted=false: ${testResult[0].count}`);
      } catch (queryError: any) {
        console.error("❌ Error running test query:", queryError.message);
      }
      
    } else {
      console.log("❌ isDeleted column does NOT exist!");
      console.log("Applying migration...");
      
      // Apply the migration
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
      `);
      
      await prisma.$executeRawUnsafe(`
        UPDATE "Message" SET "isDeleted" = false WHERE "isDeleted" IS NULL;
      `);
      
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Message_isDeleted_idx" ON "Message"("isDeleted");
      `);
      
      console.log("✅ Migration applied!");
      
      // Verify again
      const verify = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name = 'Message' 
         AND column_name = 'isDeleted'`
      );
      
      if (verify.length > 0) {
        console.log("✅ Column verified after migration!");
      } else {
        console.log("❌ Column still not found after migration!");
      }
    }
    
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyIsDeletedColumn();

