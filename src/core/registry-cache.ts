/**
 * Generic registry cache: in-memory TTL cache with inflight request
 * deduplication, concurrency-limited prefetch, background refresh near
 * expiry, and capacity eviction. Ecosystem registries supply only a `fetch`
 * that maps their registry response to a PackageInfo.
 */

import { PackageInfo, CachedPackageInfo } from './types'


const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1_000
const DEFAULT_TTL_MINUTES = 30
const BACKGROUND_REFRESH_THRESHOLD = 0.8
const BACKGROUND_REFRESH_CONCURRENCY = 3
const MAX_CACHE_ENTRIES = 500

export interface RegistryCache {
  getPackageInfo(name: string): Promise<PackageInfo | null>;
  prefetchPackages(names: string[], concurrency?: number): Promise<Map<string, PackageInfo>>;
  scheduleBackgroundRefresh(names: string[]): void;
  clearCache(): void;
  setCacheTTL(minutes: number): void;
}

export interface RegistryCacheOptions {
  /** Fetch package metadata from the underlying registry */
  fetch: (name: string) => Promise<PackageInfo>;
}

export function createRegistryCache(options: RegistryCacheOptions): RegistryCache {
  /** In-memory cache of package info */
  const cache = new Map<string, CachedPackageInfo>()

  /** Set of packages currently being fetched (dedup inflight requests) */
  const inflight = new Map<string, Promise<PackageInfo>>()

  /** Default TTL in milliseconds (30 min) */
  let cacheTTL = DEFAULT_TTL_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND

  function setCacheTTL(minutes: number): void {
    cacheTTL = minutes * SECONDS_PER_MINUTE * MS_PER_SECOND
  }

  function clearCache(): void {
    cache.clear()
  }

  async function getPackageInfo(name: string): Promise<PackageInfo | null> {
    const cached = cache.get(name)
    if (cached && Date.now() - cached.fetchedAt < cacheTTL) {
      return cached.data
    }

    const existing = inflight.get(name)
    if (existing) {
      return existing
    }

    const promise = options.fetch(name)
    inflight.set(name, promise)

    try {
      const result = await promise
      cache.set(name, { data: result, fetchedAt: Date.now() })
      evictIfOverCapacity()
      return result
    }
    catch {
      // If we have stale cache data, return it on error
      if (cached) {
        return cached.data
      }
      return null
    }
    finally {
      inflight.delete(name)
    }
  }

  async function prefetchPackages(
    names: string[],
    concurrency: number = 6
  ): Promise<Map<string, PackageInfo>> {
    const results = new Map<string, PackageInfo>()
    let nextIndex = 0

    async function worker(): Promise<void> {
      if (nextIndex >= names.length) return
      const index = nextIndex++
      const name = names[index]
      const info = await getPackageInfo(name)
      if (info) results.set(name, info)
      return worker()
    }

    const workerCount = Math.min(concurrency, names.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    return results
  }

  function scheduleBackgroundRefresh(names: string[]): void {
    const nearExpiry = names.filter((name) => {
      const cached = cache.get(name)
      if (!cached) return true
      return Date.now() - cached.fetchedAt > cacheTTL * BACKGROUND_REFRESH_THRESHOLD
    })

    if (nearExpiry.length > 0) {
      // Fire and forget - don't block the caller
      prefetchPackages(nearExpiry, BACKGROUND_REFRESH_CONCURRENCY).catch(() => {
        // Silently ignore background refresh failures
      })
    }
  }

  function evictIfOverCapacity(): void {
    if (cache.size <= MAX_CACHE_ENTRIES) return

    let oldestKey: string | undefined
    let oldestTime = Infinity
    for (const [key, entry] of cache) {
      if (entry.fetchedAt < oldestTime) {
        oldestTime = entry.fetchedAt
        oldestKey = key
      }
    }
    if (oldestKey) cache.delete(oldestKey)
  }

  return { getPackageInfo, prefetchPackages, scheduleBackgroundRefresh, clearCache, setCacheTTL }
}
