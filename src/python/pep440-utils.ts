/**
 * PEP 440 version analysis for Python packages.
 * Mirrors the npm semver-utils contract using @renovatebot/pep440.
 */

import { compare, explain, maxSatisfying, satisfies, validRange } from '@renovatebot/pep440'

import { PackageInfo, VersionAnalysis } from '../core/types'


/** Operators that may prefix a PEP 440 specifier, longest-first. */
const OPERATOR = /^(===|==|~=|!=|<=|>=|<|>)/

/** Detects a pre/dev/post release marker inside a specifier or version. */
const PRERELEASE_MARKER = /(a|b|c|rc|alpha|beta|pre|preview|\.?dev)\d*/i

/**
 * Analyze a dependency's specifier against the versions available on PyPI.
 */
export function analyzeVersion(
  versionRange: string,
  packageInfo: PackageInfo
): VersionAnalysis {
  const latest = packageInfo.latest || ''
  const includePrereleases = PRERELEASE_MARKER.test(stripOperators(versionRange))

  const isValidRange = validRange(versionRange)

  const maxSatisfyingVersion = isValidRange
    ? maxSatisfying(packageInfo.versions, versionRange, { prereleases: includePrereleases })
    : null

  const isUpToDate = latest && isValidRange
    ? satisfies(latest, versionRange, { prereleases: includePrereleases })
    : !latest

  const current = maxSatisfyingVersion ?? stripOperators(versionRange)
  const updateType = getUpdateType(current, latest)

  return {
    currentRange: versionRange,
    maxSatisfying: maxSatisfyingVersion,
    latest,
    isUpToDate,
    updateType,
    latestPublishDate: packageInfo.time[latest] || undefined,
  }
}

function getUpdateType(
  current: string,
  latest: string
): VersionAnalysis['updateType'] {
  const currentParsed = explain(current)
  const latestParsed = explain(latest)

  if (!currentParsed || !latestParsed) {
    return 'none'
  }

  if (compare(currentParsed.public, latestParsed.public) >= 0) {
    return 'none'
  }

  if (latestParsed.is_prerelease) {
    return 'prerelease'
  }

  const currentRelease = currentParsed.release
  const latestRelease = latestParsed.release

  if (segment(latestRelease, 0) > segment(currentRelease, 0)) {
    return 'major'
  }
  if (segment(latestRelease, 1) > segment(currentRelease, 1)) {
    return 'minor'
  }
  return 'patch'
}

function segment(release: number[], index: number): number {
  return release[index] ?? 0
}

/**
 * Suggest an updated specifier, preserving the original operator.
 * E.g. "==2.0.0" → "==2.31.0", ">=1.0" → ">=2.0". Compound specifiers
 * (comma-joined) collapse to an exact pin.
 */
export function suggestVersionUpdate(
  currentRange: string,
  targetVersion: string
): string {
  if (currentRange.includes(',')) {
    return `==${targetVersion}`
  }

  const operatorMatch = currentRange.match(OPERATOR)
  const operator = operatorMatch ? operatorMatch[1] : '=='
  return `${operator}${targetVersion}`
}

function stripOperators(range: string): string {
  return range.replace(/^[=~!<>\s]+/, '').trim()
}
