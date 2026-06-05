/**
 * Parses device and browser information from a user agent string
 */
export function parseUserAgent(userAgent: string | null | undefined): {
  device: string | null;
  browser: string | null;
} {
  if (!userAgent) {
    return { device: null, browser: null };
  }

  const ua = userAgent;
  let device: string | null = null;
  let browser: string | null = null;

  // Detect device
  if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    if (/iPhone|iPad|iPod/i.test(ua)) {
      device = "iOS";
    } else if (/Android/i.test(ua)) {
      device = "Android";
    } else {
      device = "Mobile";
    }
  } else {
    device = "Desktop";
  }

  // Detect browser
  if (ua.includes("Chrome") && !ua.includes("Edg")) {
    browser = "Chrome";
  } else if (ua.includes("Firefox")) {
    browser = "Firefox";
  } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
    browser = "Safari";
  } else if (ua.includes("Edg")) {
    browser = "Edge";
  } else if (ua.includes("Opera") || ua.includes("OPR")) {
    browser = "Opera";
  } else {
    browser = "Unknown";
  }

  return { device, browser };
}

