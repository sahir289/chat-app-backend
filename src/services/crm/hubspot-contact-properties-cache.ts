/**
 * In-memory cache for HubSpot GET /crm/v3/properties/contacts per integration.
 * Avoids refetching the full property catalog on every lead sync (HubSpot allows hundreds of properties).
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  names: Set<string>;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();

export function getHubSpotContactPropertyNamesCached(integrationId: string): Set<string> | null {
  const entry = store.get(integrationId);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) {
      store.delete(integrationId);
    }
    return null;
  }
  return entry.names;
}

export function setHubSpotContactPropertyNamesCached(
  integrationId: string,
  names: Set<string>,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  store.set(integrationId, {
    names,
    expiresAt: Date.now() + ttlMs,
  });
}

/** Test / admin hooks */
export function clearHubSpotContactPropertyNamesCache(integrationId?: string): void {
  if (integrationId) {
    store.delete(integrationId);
    return;
  }
  store.clear();
}
