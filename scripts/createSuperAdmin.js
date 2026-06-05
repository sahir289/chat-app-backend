"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_service_1 = require("../src/services/authService");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env") });
const SUPER_ADMIN_EMAIL = process.argv[2];
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME || "Super Admin";
async function createSuperAdmin() {
    console.log("🚀 Starting SUPER_ADMIN setup...\n");
    if (!SUPER_ADMIN_EMAIL) {
        console.error("❌ Error: Email address is required");
        console.error("   Usage: npm run createSuperAdmin <email>");
        console.error("   Example: npm run createSuperAdmin admin@yourplatform.com");
        process.exit(1);
    }
    if (!SUPER_ADMIN_PASSWORD) {
        console.error("❌ Error: SUPER_ADMIN_PASSWORD environment variable is not set");
        console.error("   Please set it in your .env file:");
        console.error("   SUPER_ADMIN_PASSWORD=SecurePassword123!");
        process.exit(1);
    }
    if (SUPER_ADMIN_PASSWORD.length < 8) {
        console.error("❌ Error: SUPER_ADMIN_PASSWORD must be at least 8 characters long");
        process.exit(1);
    }
    try {
        console.log(`📧 Email: ${SUPER_ADMIN_EMAIL}`);
        console.log(`👤 Name: ${SUPER_ADMIN_NAME}`);
        console.log("⏳ Creating SUPER_ADMIN user...\n");
        const superAdmin = await auth_service_1.authService.initializeSuperAdmin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME);
        console.log("✅ SUPER_ADMIN created successfully!\n");
        console.log("📋 User Details:");
        console.log(`   ID: ${superAdmin.id}`);
        console.log(`   Email: ${superAdmin.email}`);
        console.log(`   Name: ${superAdmin.name || "N/A"}`);
        console.log(`   Role: ${superAdmin.role}`);
        console.log(`   Is Super Admin: ${superAdmin.isSuperAdmin}`);
        console.log(`   Is Active: ${superAdmin.isActive}`);
        console.log(`   Company ID: ${superAdmin.companyId || "null (platform-level access)"}\n`);
        console.log("🔐 You can now login with these credentials:");
        console.log(`   Email: ${SUPER_ADMIN_EMAIL}`);
        console.log(`   Password: [The password you set in SUPER_ADMIN_PASSWORD]\n`);
        console.log("⚠️  IMPORTANT: Keep your credentials secure and never commit them to git!");
        process.exit(0);
    }
    catch (error) {
        if (error.statusCode === 400 && error.message.includes("already exists")) {
            console.error("❌ Error: SUPER_ADMIN already exists!");
            console.error("   Only one SUPER_ADMIN is allowed in the system.");
            console.error("   If you need to reset the SUPER_ADMIN, delete the existing user from the database first.\n");
        }
        else {
            console.error("❌ Error creating SUPER_ADMIN:");
            console.error(`   ${error.message || error}\n`);
        }
        process.exit(1);
    }
}
createSuperAdmin();
