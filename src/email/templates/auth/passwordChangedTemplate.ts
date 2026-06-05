import { EmailTemplateResult, PasswordChangedTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function passwordChangedTemplate(
    props: PasswordChangedTemplateProps
): EmailTemplateResult {
    const { name, platformName = PLATFORM_NAME_DEFAULT } = props;

    const subject = `Your password has been changed - ${platformName}`;

    const text = [
        `Hello ${name || "there"},`,
        "",
        "Your password for your " + platformName + " account has been successfully changed.",
        "",
        "If you did not make this change, please contact our support team immediately.",
        "",
        "For security reasons, all your active sessions have been logged out. You will need to log in again with your new password.",
        "",
        "Best regards,",
        `The ${platformName} Team`,
    ].join("\n");

    const htmlContent = `
    <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">Password Changed Successfully</h1>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Your password for your ${platformName} account has been successfully changed.</p>
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
      <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0;"><strong>Security Notice:</strong></p>
      <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">If you did not make this change, please contact our support team immediately.</p>
    </div>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 16px 0 0 0;">For security reasons, all your active sessions have been logged out. You will need to log in again with your new password.</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Best regards,<br><strong>The ${platformName} Team</strong></p>
  `;

    const html = getEmailTemplate(htmlContent, platformName);

    return { subject, html, text };
}

