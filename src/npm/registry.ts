/**
 * npm registry client. Maps the npm registry response to the generic
 * PackageInfo and reuses the shared registry cache.
 */

import { fetchJson } from '../core/http'
import { createRegistryCache } from '../core/registry-cache'
import { PackageInfo } from '../core/types'


interface NpmRegistryResponse {
  versions?: Record<string, unknown>;
  'dist-tags'?: Record<string, string>;
  time?: Record<string, string>;
  description?: string;
  homepage?: string;
}

const REGISTRY_URL = 'https://registry.npmjs.org'

async function fetchFromNpm(packageName: string): Promise<PackageInfo> {
  const url = `${REGISTRY_URL}/${encodeURIComponent(packageName)}`
  const json = await fetchJson<NpmRegistryResponse>(url, {
    notFoundLabel: `Package not found: ${packageName}`,
  })
  return parseRegistryResponse(packageName, json)
}

function parseRegistryResponse(packageName: string, json: NpmRegistryResponse): PackageInfo {
  const versions = json.versions ? Object.keys(json.versions) : []
  const distTags = json['dist-tags'] ?? {}
  const time = json.time ?? {}
  const description = json.description ?? ''
  const homepage = json.homepage ?? ''

  return {
    name: packageName,
    versions,
    latest: json['dist-tags']?.latest ?? '',
    distTags,
    time,
    description,
    homepage,
    registryUrl: `https://www.npmjs.com/package/${packageName}`,
  }
}

export const npmRegistry = createRegistryCache({ fetch: fetchFromNpm })
