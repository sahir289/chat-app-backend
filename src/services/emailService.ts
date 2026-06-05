import nodemailer from "nodemailer";
import { SendEmailInput } from "../email/emailTypes";
import { proUpgradeNotificationTemplate } from "../email/templates/billing/proUpgradeNotificationTemplate";
import prisma from "../lib/prisma";
import { config } from "../config";
/**
 * Retry utility for email sending with exponential backoff
 * Returns true if successful, false if all retries failed
 */
async function retryEmailSend(
  sendFn: () => Promise<any>,
  maxRetries: number = config.email.retry.maxRetries,
  initialDelay: number = config.email.retry.initialDelay
): Promise<boolean> {
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendFn();
      return true; // Success
    } catch (error: any) {
      lastError = error;

      // Don't retry authentication errors (EAUTH) - credentials are wrong, retrying won't help
      if (error?.code === "EAUTH") {
        const errorMessage = error?.message || "Unknown error";
        // Don't log response as it may contain sensitive data
        return false;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        // Only log retry attempts in development or if verbose logging is enabled
        if (!config.server.isProduction || config.email.verboseLogs) {
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed - log clean error message
  const errorMsg = lastError?.message || "Unknown error";
  const errorCode = lastError?.code || "UNKNOWN";
  return false;
}

/**
 * Create and configure SMTP transporter
 * Returns null if SMTP is not configured
 */
function createTransport() {
  const { host, port, user, pass, secure } = config.email.smtp;

  if (!host || !port || !user || !pass) {
    return null;
  }

  const transportConfig: any = {
    host,
    port,
    secure, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  };

  // Add TLS configuration for port 587 (STARTTLS)
  if (port === 587) {
    transportConfig.requireTLS = true;
    transportConfig.tls = {
      rejectUnauthorized: false, // Set to true in production with valid certificates
    };
  }

  return nodemailer.createTransport(transportConfig);
}

/**
 * Generic email sending function
 * This is the only function that should be used to send emails
 * 
 * @param input - Email input with to, subject, html, and optional text/from
 * @returns Promise<boolean> - true if sent successfully, false otherwise
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const transporter = createTransport();
  const from = input.from || config.email.from || config.email.smtp.user || "no-reply@mitravarta.chat";

  // Handle array of recipients
  const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;

  if (!transporter) {
    return false;
  }

  // Use retry logic for email sending
  const success = await retryEmailSend(async () => {
    await transporter.sendMail({
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    // Only log success in development or if verbose logging is enabled
    if (!config.server.isProduction || config.email.verboseLogs) {
    }
  });

  if (!success) {
    // Log failure but don't throw - operation should succeed even if email fails
  }

  return success;
}

/**
 * Send PRO upgrade notification emails to all active users in a company
 * This is called when PRO is enabled for a company
 */
export async function notifyCompanyUsersOfProUpgrade(
  companyId: string,
  companyName: string
): Promise<void> {
  try {
    // Get all active users in the company
    const users = await prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Filter out users without email addresses
    const usersWithEmail = users.filter((user) => user.email && user.email.trim() !== "");

    if (usersWithEmail.length === 0) {
      return;
    }

    // Send emails to all users asynchronously (don't wait for all to complete)
    const emailPromises = usersWithEmail.map((user) => {
      const template = proUpgradeNotificationTemplate({
        name: user.name || "User",
        companyName,
      });
      return sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      }).catch((err) => {
        // Log individual failures but don't stop other emails
        const errorMessage = err instanceof Error ? err.message : String(err);
      });
    });

    // Wait for all emails to be sent (or fail)
    await Promise.allSettled(emailPromises);

  } catch (error: any) {
    // Log error but don't throw - PRO enable should succeed even if emails fail
    const errorMessage = error?.message || String(error);
  }
}
