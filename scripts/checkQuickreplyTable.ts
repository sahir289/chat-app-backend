import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkQuickReplyTable() {
  try {
    console.log("Checking QuickReply table in database...");
    
    // Check what tables exist
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name = 'QuickReply' OR table_name = 'quickReply' OR table_name = 'quick_reply')
      ORDER BY table_name
    `;

    console.log("Tables found:", tables);

    // Try to query the QuickReply table directly
    try {
      const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "QuickReply"
      `;
      console.log("✓ QuickReply table exists and is accessible. Row count:", count[0].count);
    } catch (error: any) {
      console.error("✗ Error accessing QuickReply table:", error.message);
    }

    // Test Prisma client access
    try {
      const quickReplies = await prisma.quickReply.findMany({ take: 1 });
      console.log("✓ Prisma client can access quickReply model. Sample count:", quickReplies.length);
    } catch (error: any) {
      console.error("✗ Error accessing via Prisma client:", error.message);
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkQuickReplyTable();

