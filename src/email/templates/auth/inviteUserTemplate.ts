import { EmailTemplateResult, InviteUserTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function inviteUserTemplate(
    props: InviteUserTemplateProps
): EmailTemplateResult {
    const { name, inviteLink, platformName = PLATFORM_NAME_DEFAULT } = props;

    const subject = "You're invited to join Mitra Varta";

    const text = [
        `Hello ${name || "there"},`,
        "",
        "You have been invited to join the Mitra Varta team.",
        "Click below to set your password:",
        inviteLink,
        "",
        "This link expires in 24 hours.",
    ].join("\n");

    const htmlContent = `
    <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">You're Invited!</h1>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">You have been invited to join the Mitra Varta Chat team.</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Click the button below to set your password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteLink}" style="display: inline-block; padding: 14px 28px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Set Password</a>
    </div>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Or copy and paste this link into your browser:</p>
    <p style="color: #64748b; font-size: 12px; margin: 8px 0; word-break: break-all;">${inviteLink}</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">This link expires in 24 hours.</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Best regards,<br><strong>The ${platformName} Team</strong></p>
  `;

    const html = getEmailTemplate(htmlContent, platformName);

    return { subject, html, text };
}

