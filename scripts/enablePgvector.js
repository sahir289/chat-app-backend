"use strict";
/**
 * Script to enable pgvector extension in PostgreSQL
 * Run with: npx ts-node scripts/enablePgvector.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function enablePgVector() {
    try {
        console.log('Attempting to enable pgvector extension...');
        await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('✅ pgvector extension enabled successfully!');
        // Verify it's enabled
        const result = await prisma.$queryRawUnsafe("SELECT extname FROM pg_extension WHERE extname = 'vector';");
        if (result.length > 0) {
            console.log('✅ Extension verified and active');
        }
        else {
            console.log('⚠️  Extension command succeeded but not found in pg_extension');
        }
    }
    catch (error) {
        if (error.message?.includes('permission denied')) {
            console.error('❌ Permission denied. You need superuser privileges to create extensions.');
            console.error('   Please run this SQL manually as a superuser:');
            console.error('   CREATE EXTENSION IF NOT EXISTS vector;');
        }
        else if (error.message?.includes('is not available')) {
            console.error('❌ pgvector extension is not installed in PostgreSQL.');
            console.error('   Please install it first. See prisma/pgvectorSetup.md for instructions.');
        }
        else {
            console.error('❌ Error:', error.message);
        }
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
enablePgVector();
