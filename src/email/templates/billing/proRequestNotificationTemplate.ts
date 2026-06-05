import { EmailTemplateResult, ProRequestNotificationTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function proRequestNotificationTemplate(
    props: ProRequestNotificationTemplateProps
): EmailTemplateResult {
    const { requestData, platformName = PLATFORM_NAME_DEFAULT } = props;

    const subject = `New Pro Access Request from ${requestData.companyName}`;

    const text = [
        "New Pro Access Request Received",
        "",
        "A new request for Pro access has been submitted:",
        "",
        `Company: ${requestData.companyName}`,
        `Contact Name: ${requestData.name}`,
        `Email: ${requestData.email}`,
        requestData.phone ? `Phone: ${requestData.phone}` : "",
        requestData.message ? `Message: ${requestData.message}` : "",
        "",
        "Please review this request in the Super Admin dashboard.",
    ]
        .filter((line) => line !== "")
        .join("\n");

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">New Pro Access Request Received</h2>
      <p>A new request for Pro access has been submitted:</p>
      <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Company:</strong> ${requestData.companyName}</p>
        <p><strong>Contact Name:</strong> ${requestData.name}</p>
        <p><strong>Email:</strong> <a href="mailto:${requestData.email}">${requestData.email}</a></p>
        ${requestData.phone ? `<p><strong>Phone:</strong> ${requestData.phone}</p>` : ""}
        ${requestData.message ? `<p><strong>Message:</strong><br>${requestData.message}</p>` : ""}
      </div>
      <p>Please review this request in the Super Admin dashboard.</p>
    </div>
  `;

    const html = getEmailTemplate(htmlContent, platformName);

    return { subject, html, text };
}

