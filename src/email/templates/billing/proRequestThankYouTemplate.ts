import { EmailTemplateResult, ProRequestThankYouTemplateProps } from "../../emailTypes";
import { getEmailTemplate } from "../../emailUtils";

const PLATFORM_NAME_DEFAULT = process.env.PLATFORM_NAME || "Mitra Varta";

export function proRequestThankYouTemplate(
    props: ProRequestThankYouTemplateProps
): EmailTemplateResult {
    const { name, companyName, platformName = PLATFORM_NAME_DEFAULT } = props;

    const subject = "Thank You for Your Pro Access Request";

    const text = [
        `Hello ${name || "there"},`,
        "",
        "Thank you for requesting Pro access to Mitra Varta!",
        "",
        `We have received your request for ${companyName} and our team will review it shortly.`,
        "",
        "We'll contact you soon to discuss how Pro features can help enhance your chatbot experience.",
        "",
        "If you have any questions in the meantime, please don't hesitate to reach out.",
        "",
        "Best regards,",
        "The Mitra Varta Team",
    ].join("\n");

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">Thank You for Your Pro Access Request</h2>
      <p>Hello ${name || "there"},</p>
      <p>Thank you for requesting Pro access to Mitra Varta!</p>
      <p>We have received your request for <strong>${companyName}</strong> and our team will review it shortly.</p>
      <p>We'll contact you soon to discuss how Pro features can help enhance your chatbot experience.</p>
      <p>If you have any questions in the meantime, please don't hesitate to reach out.</p>
      <p>Best regards,<br>The Mitra Varta Team</p>
    </div>
  `;

    const html = getEmailTemplate(htmlContent, platformName);

    return { subject, html, text };
}

