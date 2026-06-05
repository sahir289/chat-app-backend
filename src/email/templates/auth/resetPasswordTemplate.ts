import { EmailTemplateResult, ResetPasswordTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function resetPasswordTemplate(
    props: ResetPasswordTemplateProps
): EmailTemplateResult {
    const { name, resetLink, platformName = PLATFORM_NAME_DEFAULT } = props;

    const subject = `Reset your password - ${platformName}`;

    const text = [
        `Hello ${name || "there"},`,
        "",
        "You requested to reset your password for your " + platformName + " account.",
        "",
        "Click the link below to reset your password:",
        resetLink,
        "",
        "This link will expire in 1 hour.",
        "",
        "If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.",
        "",
        "Best regards,",
        `The ${platformName} Team`,
    ].join("\n");

    const htmlContent = `
    <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">Reset Your Password</h1>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">You requested to reset your password for your ${platformName} account.</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Click the button below to reset your password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetLink}" style="display: inline-block; padding: 14px 28px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
    </div>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Or copy and paste this link into your browser:</p>
    <p style="color: #64748b; font-size: 12px; margin: 8px 0; word-break: break-all;">${resetLink}</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">This link will expire in 1 hour.</p>
    <p style="color: #64748b; font-size: 14px; margin: 16px 0 0 0;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Best regards,<br><strong>The ${platformName} Team</strong></p>
  `;

    const html = getEmailTemplate(htmlContent, platformName);

    return { subject, html, text };
}

