import { EmailTemplateResult, ProUpgradeNotificationTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function proUpgradeNotificationTemplate(
    props: ProUpgradeNotificationTemplateProps
): EmailTemplateResult {
    const { name, companyName, platformName = PLATFORM_NAME_DEFAULT } = props;

    const subject = `Pro Access Enabled for ${companyName}`;

    const text = [
        `Hello ${name || "there"},`,
        "",
        "Great news! Pro access has been enabled for your company.",
        "",
        `Your company ${companyName} now has Pro access to ${platformName}.`,
        "",
        "You now have access to all premium features including:",
        "- Advanced analytics and reporting",
        "- Custom branding and white-labeling",
        "- API access and webhooks",
        "- Priority support",
        "- Custom integrations",
        "- Unlimited agents",
        "- Advanced automation workflows",
        "- Data export capabilities",
        "- SSO (Single Sign-On)",
        "",
        "You can start using these features immediately by logging into your dashboard.",
        "",
        "If you have any questions or need assistance, our priority support team is here to help.",
        "",
        "Welcome to Pro!",
        "",
        "Best regards,",
        `The ${platformName} Team`,
    ].join("\n");

    const htmlContent = `
    <h1 style="color: #10b981; margin: 0 0 20px 0; font-size: 28px;">Pro Access Enabled! 🎉</h1>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;"><strong>Great news! Pro access has been enabled for your company.</strong></p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Your company <strong>${companyName}</strong> now has Pro access to ${platformName}.</p>
    <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; color: #065f46; font-weight: 600; font-size: 18px;">✨ PRO Access Enabled</p>
      <p style="margin: 0 0 16px 0; color: #047857; font-size: 14px;">You now have access to all premium features including:</p>
      <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px; line-height: 1.8;">
        <li>Advanced analytics and reporting</li>
        <li>Custom branding and white-labeling</li>
        <li>API access and webhooks</li>
        <li><strong>Priority support</strong></li>
        <li>Custom integrations</li>
        <li>Unlimited agents</li>
        <li>Advanced automation workflows</li>
        <li>Data export capabilities</li>
        <li>SSO (Single Sign-On)</li>
      </ul>
    </div>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">You can start using these features immediately by logging into your dashboard.</p>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">If you have any questions or need assistance, our <strong>priority support team</strong> is here to help.</p>
    <p style="font-size: 20px; font-weight: bold; color: #10b981; margin: 32px 0 16px 0;">Welcome to Pro! 🚀</p>
    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Best regards,<br><strong>The ${platformName} Team</strong></p>
  `;

    const html = getEmailTemplate(htmlContent, platformName);

    return { subject, html, text };
}

