import { sendEmail } from "../services/emailService";
import { verifyEmailTemplate } from "./templates/auth/verifyEmailTemplate";
import { welcomeEmailTemplate } from "./templates/auth/welcomeEmailTemplate";
import { newUserNotificationTemplate } from "./templates/notifications/newUserNotificationTemplate";
import { getModuleLogger } from "../utils/logger";

const log = getModuleLogger("authEmailHelpers");

function logEmailResult(message: string, success: boolean = true): void {
    if (process.env.NODE_ENV !== "production" || process.env.VERBOSE_EMAIL_LOGS === "true") {
        if (success) {
            log.info(message);
        } else {
            log.error(message);
        }
    }
}

function handleEmailError(error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to ${context} (non-blocking): ${errorMessage}`);
}

export async function sendEmailAsync(
    emailFn: () => Promise<boolean>,
    successMessage: string,
    errorContext: string
): Promise<void> {
    try {
        const emailSent = await emailFn();
        if (emailSent) {
            logEmailResult(successMessage);
        }
    } catch (err: unknown) {
        handleEmailError(err, errorContext);
    }
}

export async function sendVerificationEmailAsync(
    email: string,
    name: string,
    verificationLink: string
): Promise<void> {
    await sendEmailAsync(
        async () => {
            const template = verifyEmailTemplate({ name, verificationLink });
            return await sendEmail({
                to: email,
                subject: template.subject,
                html: template.html,
                text: template.text,
            });
        },
        `Verification email sent to ${email}`,
        "send verification email"
    );
}

export async function sendWelcomeEmailAsync(
    email: string,
    name: string,
    companyName: string,
    isPro: boolean
): Promise<void> {
    await sendEmailAsync(
        async () => {
            const template = welcomeEmailTemplate({ name, companyName, isPro });
            return await sendEmail({
                to: email,
                subject: template.subject,
                html: template.html,
                text: template.text,
            });
        },
        `Welcome email sent to ${email} after verification (${isPro ? "PRO" : "FREE"})`,
        "send welcome email after verification"
    );
}

export async function sendNewUserNotificationAsync(
    superAdminEmails: string[],
    userData: {
        name: string;
        email: string;
        companyName: string;
        registrationDate: Date;
    }
): Promise<void> {
    if (superAdminEmails.length === 0) {
        if (process.env.NODE_ENV !== "production") {
            log.warn("No super admins found to notify");
        }
        return;
    }

    await sendEmailAsync(
        async () => {
            const template = newUserNotificationTemplate({ userData });
            return await sendEmail({
                to: superAdminEmails,
                subject: template.subject,
                html: template.html,
                text: template.text,
            });
        },
        `New user notification sent to ${superAdminEmails.length} super admin(s)`,
        "send new user notification"
    );
}

