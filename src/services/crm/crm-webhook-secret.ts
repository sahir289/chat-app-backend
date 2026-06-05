import { AppError } from "../../utils/appError";

export type WebhookSecretConnectResolution =
  | { kind: "provided"; plaintext: string }
  | { kind: "generate" };

/**
 * Webhook HMAC secret must either be supplied by the caller or explicitly auto-generated
 * (returned once in the connect response — never stored in plaintext outside the DB encryption path).
 */
export function resolveWebhookSecretForConnect(params: {
  webhookSecret?: string | null;
  generateWebhookSecret?: boolean | null;
}): WebhookSecretConnectResolution {
  const trimmed = typeof params.webhookSecret === "string" ? params.webhookSecret.trim() : "";
  if (trimmed.length > 0) {
    return { kind: "provided", plaintext: trimmed };
  }
  if (params.generateWebhookSecret === true) {
    return { kind: "generate" };
  }
  throw new AppError(
    400,
    "webhookSecret is required, or set generateWebhookSecret to true to auto-generate a secret (returned once in this response only)"
  );
}
