import { getRedisClient, isRedisAvailable } from "./redis";
import { getModuleLogger } from "./logger";

const log = getModuleLogger("ipLocation");

export interface IPLocation {
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
}

// Cache TTL: 1 hour in seconds
const CACHE_TTL = 60 * 60;
const NEGATIVE_CACHE_TTL = 5 * 60; // 5 minutes for failed lookups

// Fallback in-memory cache for when Redis is unavailable
const fallbackCache = new Map<string, { data: IPLocation; expires: number }>();

export async function getLocationFromIP(
  ipAddress: string | null
): Promise<IPLocation> {
  if (!ipAddress) {
    return {
      country: null,
      countryCode: null,
      city: null,
      region: null,
    };
  }

  // Check cache first
  const redisAvailable = await isRedisAvailable();

  if (redisAvailable) {
    try {
      const redis = getRedisClient();
      const cacheKey = `iplocation:${ipAddress}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      log.warn("Redis error in getLocationFromIP cache check, falling back to memory:", error);
    }
  }

  // Fallback to memory cache
  const cached = fallbackCache.get(ipAddress);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  if (
    ipAddress === "127.0.0.1" ||
    ipAddress === "::1" ||
    ipAddress.startsWith("192.168.") ||
    ipAddress.startsWith("10.") ||
    ipAddress.startsWith("172.16.") ||
    ipAddress.startsWith("172.17.") ||
    ipAddress.startsWith("172.18.") ||
    ipAddress.startsWith("172.19.") ||
    ipAddress.startsWith("172.20.") ||
    ipAddress.startsWith("172.21.") ||
    ipAddress.startsWith("172.22.") ||
    ipAddress.startsWith("172.23.") ||
    ipAddress.startsWith("172.24.") ||
    ipAddress.startsWith("172.25.") ||
    ipAddress.startsWith("172.26.") ||
    ipAddress.startsWith("172.27.") ||
    ipAddress.startsWith("172.28.") ||
    ipAddress.startsWith("172.29.") ||
    ipAddress.startsWith("172.30.") ||
    ipAddress.startsWith("172.31.")
  ) {
    return {
      country: "Local",
      countryCode: null,
      city: null,
      region: null,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,city,regionName`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`IP API returned ${response.status}`);
    }

    const data = await response.json();

    let result: IPLocation;
    if (data.status === "success") {
      result = {
        country: data.country || null,
        countryCode: data.countryCode || null,
        city: data.city || null,
        region: data.regionName || null,
      };
    } else {
      result = {
        country: null,
        countryCode: null,
        city: null,
        region: null,
      };
    }

    // Cache the result
    if (redisAvailable) {
      try {
        const redis = getRedisClient();
        const cacheKey = `iplocation:${ipAddress}`;
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
      } catch (error) {
        log.warn("Redis error in getLocationFromIP cache set, falling back to memory:", error);
      }
    }

    // Fallback to memory cache
    fallbackCache.set(ipAddress, {
      data: result,
      expires: Date.now() + CACHE_TTL * 1000,
    });

    // Clean up expired entries from fallback cache periodically
    if (fallbackCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of fallbackCache.entries()) {
        if (value.expires <= now) {
          fallbackCache.delete(key);
        }
      }
    }

    return result;
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      log.error("Failed to get location from IP", { error });
    }
    const result = {
      country: null,
      countryCode: null,
      city: null,
      region: null,
    };

    // Cache negative results for shorter time (5 minutes) to avoid repeated failures
    if (redisAvailable) {
      try {
        const redis = getRedisClient();
        const cacheKey = `iplocation:${ipAddress}`;
        await redis.setex(cacheKey, NEGATIVE_CACHE_TTL, JSON.stringify(result));
      } catch (error) {
        log.warn("Redis error in getLocationFromIP negative cache set, falling back to memory:", error);
      }
    }

    // Fallback to memory cache
    fallbackCache.set(ipAddress, {
      data: result,
      expires: Date.now() + NEGATIVE_CACHE_TTL * 1000,
    });

    return result;
  }
}

