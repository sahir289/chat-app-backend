import { EmailTemplateResult, NewUserNotificationTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function newUserNotificationTemplate(
  props: NewUserNotificationTemplateProps
): EmailTemplateResult {
  const { userData, platformName = PLATFORM_NAME_DEFAULT } = props;

  const registrationDateStr = userData.registrationDate.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const subject = "New User Registration Alert";
  
  const text = [
    "New User Registration Alert",
    "",
    "A new user has registered on " + platformName + ":",
    "",
    `Name: ${userData.name || "N/A"}`,
    `Email: ${userData.email}`,
    `Company: ${userData.companyName}`,
    `Registration Date/Time: ${registrationDateStr}`,
    "",
    "You can view and manage this user in the Super Admin dashboard.",
  ].join("\n");

  const htmlContent = `
    <h1 style="color: #1e293b; margin: 0 0 20px 0; font-size: 28px;">New User Registration Alert</h1>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">A new user has registered on ${platformName}:</p>
    <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; color: #1e293b; font-size: 14px;"><strong>Name:</strong> <span style="color: #475569;">${userData.name || "N/A"}</span></p>
      <p style="margin: 0 0 12px 0; color: #1e293b; font-size: 14px;"><strong>Email:</strong> <a href="mailto:${userData.email}" style="color: #3b82f6; text-decoration: none;">${userData.email}</a></p>
      <p style="margin: 0 0 12px 0; color: #1e293b; font-size: 14px;"><strong>Company:</strong> <span style="color: #475569;">${userData.companyName}</span></p>
      <p style="margin: 0; color: #1e293b; font-size: 14px;"><strong>Registration Date/Time:</strong> <span style="color: #475569;">${registrationDateStr}</span></p>
    </div>
    <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 24px 0 0 0;">You can view and manage this user in the Super Admin dashboard.</p>
  `;

  const html = getEmailTemplate(htmlContent, platformName);

  return { subject, html, text };
}

