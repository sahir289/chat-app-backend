import { EmailTemplateResult, VerifyEmailTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function verifyEmailTemplate(
  props: VerifyEmailTemplateProps
): EmailTemplateResult {
  const { name, verificationLink, platformName = PLATFORM_NAME_DEFAULT } = props;

  const subject = `Verify your email address - ${platformName}`;

  const text = [
    `Hello ${name || "there"},`,
    "",
    "Thank you for registering with " + platformName + "!",
    "",
    "Please verify your email address by clicking the link below:",
    verificationLink,
    "",
    "This link will expire in 24 hours.",
    "",
    "If you didn't create an account, you can safely ignore this email.",
    "",
    "Best regards,",
    `The ${platformName} Team`,
  ].join("\n");

  const htmlContent = `
    <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">Verify Your Email Address</h1>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Thank you for registering with ${platformName}!</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Please verify your email address by clicking the button below:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationLink}" style="display: inline-block; padding: 14px 28px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
    </div>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Or copy and paste this link into your browser:</p>
    <p style="color: #64748b; font-size: 12px; margin: 8px 0; word-break: break-all;">${verificationLink}</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">This link will expire in 24 hours.</p>
    <p style="color: #64748b; font-size: 14px; margin: 16px 0 0 0;">If you didn't create an account, you can safely ignore this email.</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Best regards,<br><strong>The ${platformName} Team</strong></p>
  `;

  const html = getEmailTemplate(htmlContent, platformName);

  return { subject, html, text };
}

