import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "./appError";

type PublicUrlOptions = {
  allowPrivateHosts?: boolean;
};

type FetchPublicUrlOptions = PublicUrlOptions & {
  timeoutMs?: number;
  maxRedirects?: number;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first >= 224) return true;

  return false;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

    const mappedIPv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIPv4?.[1]) {
      return isPrivateIPv4(mappedIPv4[1]);
    }
  }

  return true;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
}

export async function assertPublicHttpUrl(
  rawUrl: string | URL,
  options: PublicUrlOptions = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    throw new AppError(400, "Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "Only http and https URLs are allowed");
  }

  if (options.allowPrivateHosts) {
    return parsed;
  }

  const hostname = parsed.hostname;
  if (isLocalHostname(hostname)) {
    throw new AppError(400, "URL host is not allowed");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new AppError(400, "URL host is not allowed");
    }
    return parsed;
  }

  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some((address) => isPrivateIp(address.address))) {
    throw new AppError(400, "URL host is not allowed");
  }

  return parsed;
}

export async function fetchPublicUrl(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: FetchPublicUrlOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = await assertPublicHttpUrl(rawUrl, options);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), {
      ...init,
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    await response.body?.cancel();
    currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl), options);
  }

  throw new AppError(400, "Too many redirects");
}
