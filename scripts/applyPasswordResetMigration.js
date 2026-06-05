"use strict";
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
async function applyMigration() {
    try {
        console.log("Checking if password reset columns exist...");
        // Check if columns exist by trying to query them
        const result = await prisma.$queryRaw `
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
    }
    catch (error) {
        console.error("Error applying migration:", error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
applyMigration();
