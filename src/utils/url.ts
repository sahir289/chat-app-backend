import type { Request } from "express";
import { config } from "../config";

export function getBackendBaseUrl(req: Request) {
  const envUrl = config.urls.widgetBackendUrl;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const host = req.get("host");
  const protocol = req.protocol || "http";
  return `${protocol}://${host}`;
}


