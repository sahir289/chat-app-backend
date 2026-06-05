"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const email_service_1 = require("../src/services/emailService");
const welcomeEmail_template_1 = require("../src/email/templates/auth/welcomeEmailTemplate");
const newUserNotification_template_1 = require("../src/email/templates/notifications/newUserNotificationTemplate");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env") });
async function testEmailConfiguration() {
    console.log("🔍 Testing Email Configuration...\n");
    // Check environment variables
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    console.log("📋 Environment Variables:");
    console.log(`   SMTP_HOST: ${SMTP_HOST ? "✓ Set" : "✗ Missing"}`);
    console.log(`   SMTP_PORT: ${SMTP_PORT ? "✓ Set" : "✗ Missing"}`);
    console.log(`   SMTP_USER: ${SMTP_USER ? "✓ Set" : "✗ Missing"}`);
    console.log(`   SMTP_PASS: ${SMTP_PASS ? "✓ Set (hidden)" : "✗ Missing"}\n`);
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
        console.error("❌ SMTP configuration is incomplete!");
        console.error("   Please set the following in your .env file:");
        console.error("   SMTP_HOST=your-smtp-host");
        console.error("   SMTP_PORT=587 (or 465 for SSL)");
        console.error("   SMTP_USER=your-email@example.com");
        console.error("   SMTP_PASS=your-password");
        process.exit(1);
    }
    // Test email addresses
    const testUserEmail = process.argv[2] || SMTP_USER || "test@example.com";
    const testSuperAdminEmail = process.argv[3] || SMTP_USER || "admin@example.com";
    console.log("📧 Test Email Addresses:");
    console.log(`   User Email: ${testUserEmail}`);
    console.log(`   Super Admin Email: ${testSuperAdminEmail}\n`);
    try {
        console.log("📤 Sending test welcome email...");
        const welcomeTemplate = (0, welcomeEmail_template_1.welcomeEmailTemplate)({
            name: "Test User",
            companyName: "Test Company",
            isPro: false,
        });
        await (0, email_service_1.sendEmail)({
            to: testUserEmail,
            subject: welcomeTemplate.subject,
            html: welcomeTemplate.html,
            text: welcomeTemplate.text,
        });
        console.log("✅ Welcome email sent successfully!\n");
    }
    catch (error) {
        console.error("❌ Failed to send welcome email:");
        console.error(`   Error: ${error.message}`);
        if (error.code)
            console.error(`   Code: ${error.code}`);
        if (error.response)
            console.error(`   Response: ${error.response}`);
        console.error("");
    }
    try {
        console.log("📤 Sending test super admin notification...");
        const notificationTemplate = (0, newUserNotification_template_1.newUserNotificationTemplate)({
            userData: {
                name: "Test User",
                email: testUserEmail,
                companyName: "Test Company",
                registrationDate: new Date(),
            },
        });
        await (0, email_service_1.sendEmail)({
            to: [testSuperAdminEmail],
            subject: notificationTemplate.subject,
            html: notificationTemplate.html,
            text: notificationTemplate.text,
        });
        console.log("✅ Super admin notification sent successfully!\n");
    }
    catch (error) {
        console.error("❌ Failed to send super admin notification:");
        console.error(`   Error: ${error.message}`);
        if (error.code)
            console.error(`   Code: ${error.code}`);
        if (error.response)
            console.error(`   Response: ${error.response}`);
        console.error("");
    }
    console.log("✨ Email test completed!");
}
testEmailConfiguration().catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
});
