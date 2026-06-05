import { EmailTemplateResult, WelcomeEmailTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";
  
export function welcomeEmailTemplate(
  props: WelcomeEmailTemplateProps
): EmailTemplateResult {
  const { name, companyName, isPro, platformName = PLATFORM_NAME_DEFAULT } = props;

  const subject = `Welcome to ${platformName}`;

  let text: string;
  let htmlContent: string;

  if (isPro) {
    // PRO user email
    text = [
      `Hello ${name || "there"},`,
      "",
      "Thank you for registering with " + platformName + "!",
      "",
      "Your account has been successfully created.",
      "",
      `We're excited to have you and ${companyName} on board.`,
      "",
      "PRO access has been enabled for your account!",
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

    htmlContent = `
      <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">Welcome to ${platformName}!</h1>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;"><strong>Thank you for registering with ${platformName}!</strong></p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #065f46; font-weight: 600;">Your account has been successfully created.</p>
      </div>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">We're excited to have you and <strong>${companyName}</strong> on board.</p>
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
  } else {
    // FREE user email
    text = [
      `Hello ${name || "there"},`,
      "",
      "Thank you for registering with " + platformName + "!",
      "",
      "Your account has been successfully created.",
      "",
      `We're excited to have you and ${companyName} on board.`,
      "",
      "FREE plan has been activated for your account!",
      "",
      "You can now start using our powerful chatbot platform with these features:",
      "- Set up your chatbot knowledge base",
      "- Customize your chatbot widget",
      "- View basic analytics and insights",
      "- Manage your team (2 agents included)",
      "- Basic integrations",
      "",
      "Upgrade to Pro anytime to unlock advanced features like unlimited agents, API access, custom branding, priority support, and more!",
      "",
      "If you have any questions or need assistance, please don't hesitate to reach out to our support team.",
      "",
      "Welcome aboard!",
      "",
      "Best regards,",
      `The ${platformName} Team`,
    ].join("\n");

    htmlContent = `
      <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">Welcome to ${platformName}!</h1>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hello ${name || "there"},</p>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;"><strong>Thank you for registering with ${platformName}!</strong></p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #065f46; font-weight: 600;">Your account has been successfully created.</p>
      </div>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">We're excited to have you and <strong>${companyName}</strong> on board.</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px 0; color: #1e293b; font-weight: 600; font-size: 18px;">🎉 FREE Plan Activated</p>
        <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px;">You can now start using our powerful chatbot platform with these features:</p>
        <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
          <li>Set up your chatbot knowledge base</li>
          <li>Customize your chatbot widget</li>
          <li>View basic analytics and insights</li>
          <li>Manage your team (2 agents included)</li>
          <li>Basic integrations</li>
        </ul>
      </div>
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
          <strong>💡 Upgrade to Pro anytime</strong> to unlock advanced features like unlimited agents, API access, custom branding, priority support, and more!
        </p>
      </div>
      <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
      <p style="font-size: 20px; font-weight: bold; color: #1e293b; margin: 32px 0 16px 0;">Welcome aboard! 🎊</p>
      <p style="color: #64748b; font-size: 14px; margin: 24px 0 0 0;">Best regards,<br><strong>The ${platformName} Team</strong></p>
    `;
  }

  const html = getEmailTemplate(htmlContent, platformName);

  return { subject, html, text };
}

