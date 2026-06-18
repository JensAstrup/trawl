/**
 * PyPI registry client. Maps the PyPI JSON API response to the generic
 * PackageInfo and reuses the shared registry cache.
 */

import { fetchJson } from '../core/http'
import { createRegistryCache } from '../core/registry-cache'
import { PackageInfo } from '../core/types'


interface PyPIRelease {
  upload_time_iso_8601?: string;
  yanked?: boolean;
}

interface PyPIResponse {
  info?: {
    version?: string;
    summary?: string;
    home_page?: string;
    project_urls?: Record<string, string> | null;
  };
  releases?: Record<string, PyPIRelease[]>;
}

const PYPI_URL = 'https://pypi.org/pypi'

async function fetchFromPyPI(packageName: string): Promise<PackageInfo> {
  const url = `${PYPI_URL}/${encodeURIComponent(packageName)}/json`
  const json = await fetchJson<PyPIResponse>(url, {
    notFoundLabel: `Package not found: ${packageName}`,
  })
  return parsePyPIResponse(packageName, json)
}

function parsePyPIResponse(packageName: string, json: PyPIResponse): PackageInfo {
  const releases = json.releases ?? {}
  const time: Record<string, string> = {}
  const versions: string[] = []

  for (const [version, files] of Object.entries(releases)) {
    // Skip versions with no files or where every file is yanked
    if (files.length === 0) continue
    if (files.every((file) => file.yanked)) continue

    versions.push(version)

    const earliest = files
      .map((file) => file.upload_time_iso_8601)
      .filter((value): value is string => Boolean(value))
      .sort()[0]
    if (earliest) time[version] = earliest
  }

  const info = json.info ?? {}
  const projectUrls = info.project_urls ?? {}
  const homepage = info.home_page || projectUrls.Homepage || projectUrls.Source || ''

  return {
    name: packageName,
    versions,
    latest: info.version ?? '',
    time,
    description: info.summary ?? '',
    homepage,
    registryUrl: `https://pypi.org/project/${packageName}/`,
  }
}

export const pythonRegistry = createRegistryCache({ fetch: fetchFromPyPI })
