"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkFAQTable() {
    try {
        console.log("Checking FAQ table in database...");
        // Check what tables exist
        const tables = await prisma.$queryRaw `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%FAQ%' OR table_name LIKE '%faq%'
      ORDER BY table_name
    `;
        console.log("Tables found:", tables);
        // Try to query the FAQ table directly
        try {
            const count = await prisma.$queryRaw `
        SELECT COUNT(*) as count FROM "FAQ"
      `;
            console.log("✓ FAQ table exists and is accessible. Row count:", count[0].count);
        }
        catch (error) {
            console.error("✗ Error accessing FAQ table:", error.message);
        }
        // Try with lowercase
        try {
            const count = await prisma.$queryRaw `
        SELECT COUNT(*) as count FROM "faq"
      `;
            console.log("✓ faq table exists and is accessible. Row count:", count[0].count);
        }
        catch (error) {
            console.error("✗ Error accessing faq table:", error.message);
        }
        // Check Prisma client
        console.log("\nChecking Prisma client...");
        console.log("Available models:", Object.keys(prisma).filter(key => !key.startsWith('$') && !key.startsWith('_')));
    }
    catch (error) {
        console.error("Error:", error);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkFAQTable();
