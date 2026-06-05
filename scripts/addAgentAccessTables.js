"use strict";
/**
 * Script to manually add agent access control tables
 * Run with: npx ts-node scripts/addAgentAccessTables.ts
 *
 * This bypasses Prisma migrations to avoid the vector type issue
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const prisma = new client_1.PrismaClient();
async function addAgentAccessTables() {
    try {
        console.log('Reading SQL migration file...');
        const sqlPath = path.join(__dirname, '../prisma/migrations/manualAddAgentAccessControl.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        console.log('Executing SQL migration...');
        // Create tables first
        console.log('  Creating AgentModuleAccess table...');
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AgentModuleAccess" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "leadsAccess" BOOLEAN NOT NULL DEFAULT false,
        "analyticsAccess" BOOLEAN NOT NULL DEFAULT false,
        "propertiesAccess" BOOLEAN NOT NULL DEFAULT false,
        "knowledgeBaseAccess" BOOLEAN NOT NULL DEFAULT false,
        "visitorsAccess" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "AgentModuleAccess_pkey" PRIMARY KEY ("id")
      );
    `);
        console.log('  Creating AgentPropertyAccess table...');
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AgentPropertyAccess" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "propertyId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AgentPropertyAccess_pkey" PRIMARY KEY ("id")
      );
    `);
        // Create indexes
        console.log('  Creating indexes...');
        const indexStatements = [
            'CREATE UNIQUE INDEX IF NOT EXISTS "AgentModuleAccess_userId_key" ON "AgentModuleAccess"("userId");',
            'CREATE UNIQUE INDEX IF NOT EXISTS "AgentPropertyAccess_userId_propertyId_key" ON "AgentPropertyAccess"("userId", "propertyId");',
            'CREATE INDEX IF NOT EXISTS "AgentModuleAccess_userId_idx" ON "AgentModuleAccess"("userId");',
            'CREATE INDEX IF NOT EXISTS "AgentPropertyAccess_userId_idx" ON "AgentPropertyAccess"("userId");',
            'CREATE INDEX IF NOT EXISTS "AgentPropertyAccess_propertyId_idx" ON "AgentPropertyAccess"("propertyId");',
        ];
        for (const stmt of indexStatements) {
            try {
                await prisma.$executeRawUnsafe(stmt);
            }
            catch (error) {
                if (!error.message?.includes('already exists') && error.code !== '42P07') {
                    console.warn(`  Warning: ${error.message}`);
                }
            }
        }
        // Add foreign keys
        console.log('  Adding foreign key constraints...');
        const fkStatements = [
            `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentModuleAccess_userId_fkey') THEN
          ALTER TABLE "AgentModuleAccess" 
          ADD CONSTRAINT "AgentModuleAccess_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;`,
            `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentPropertyAccess_userId_fkey') THEN
          ALTER TABLE "AgentPropertyAccess" 
          ADD CONSTRAINT "AgentPropertyAccess_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;`,
            `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentPropertyAccess_propertyId_fkey') THEN
          ALTER TABLE "AgentPropertyAccess" 
          ADD CONSTRAINT "AgentPropertyAccess_propertyId_fkey" 
          FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;`,
        ];
        for (const stmt of fkStatements) {
            try {
                await prisma.$executeRawUnsafe(stmt);
            }
            catch (error) {
                if (!error.message?.includes('already exists') && error.code !== '42P07') {
                    console.warn(`  Warning: ${error.message}`);
                }
            }
        }
        console.log('✅ Agent access control tables created successfully!');
        // Verify tables exist
        const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('AgentModuleAccess', 'AgentPropertyAccess')`);
        if (tables.length === 2) {
            console.log('✅ Tables verified: AgentModuleAccess, AgentPropertyAccess');
        }
        else {
            console.log('⚠️  Warning: Some tables may not have been created');
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
addAgentAccessTables();
