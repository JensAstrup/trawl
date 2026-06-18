/**
 * npm-specific presentation: registry page URL, completion items
 * (caret / exact / tilde / dist-tags / versions), hover links, and the
 * rule for skipping non-comparable references.
 */

import * as semver from 'semver'
import * as vscode from 'vscode'

import { DependencyInfo, PackageInfo } from '../core/types'


export const MAX_VERSIONS = 30

export function packageUrl(name: string): string {
  return `https://www.npmjs.com/package/${name}`
}

/**
 * Skip packages that aren't comparable against registry versions:
 * local/workspace references, VCS/URL installs, and floating tags.
 */
export function shouldSkip(dep: DependencyInfo): boolean {
  const range = dep.versionRange
  return (
    range.startsWith('file:') ||
    range.startsWith('link:') ||
    range.startsWith('workspace:') ||
    range.startsWith('git') ||
    range.startsWith('http') ||
    range === '*' ||
    range === 'latest'
  )
}

export function hoverLinks(info: PackageInfo): string {
  let links = `[npm](${info.registryUrl})`
  if (info.homepage && info.homepage !== info.registryUrl) {
    links += ` · [Homepage](${info.homepage})`
  }
  return links
}

export function buildCompletionItems(
  dep: DependencyInfo,
  info: PackageInfo,
  replaceRange: vscode.Range
): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = []

  const sortedVersions = info.versions
    .filter((v) => semver.valid(v))
    .sort((a, b) => semver.rcompare(a, b))

  const latest = info.latest
  if (latest) {
    const latestItem = new vscode.CompletionItem(`^${latest}`, vscode.CompletionItemKind.Value)
    latestItem.detail = '(latest)'
    latestItem.documentation = new vscode.MarkdownString(`Latest stable version of **${dep.name}**`)
    latestItem.sortText = '0000'
    latestItem.range = replaceRange
    latestItem.filterText = latest
    items.push(latestItem)

    const exactItem = new vscode.CompletionItem(latest, vscode.CompletionItemKind.Value)
    exactItem.detail = '(latest, exact)'
    exactItem.sortText = '0001'
    exactItem.range = replaceRange
    exactItem.filterText = latest
    items.push(exactItem)

    const tildeItem = new vscode.CompletionItem(`~${latest}`, vscode.CompletionItemKind.Value)
    tildeItem.detail = '(latest, patch updates only)'
    tildeItem.sortText = '0002'
    tildeItem.range = replaceRange
    tildeItem.filterText = latest
    items.push(tildeItem)
  }

  // Add other dist-tags (e.g., next, beta, rc)
  for (const [tag, version] of Object.entries(info.distTags ?? {})) {
    if (tag === 'latest') continue

    const tagItem = new vscode.CompletionItem(`^${version}`, vscode.CompletionItemKind.Value)
    tagItem.detail = `(${tag})`
    tagItem.sortText = `01-${tag}`
    tagItem.range = replaceRange
    tagItem.filterText = `${version} ${tag}`
    items.push(tagItem)
  }

  const versionItems = sortedVersions.slice(0, MAX_VERSIONS).map((version, index) => {
    const publishDate = info.time[version]
    const item = new vscode.CompletionItem(`^${version}`, vscode.CompletionItemKind.Value)
    item.detail = publishDate ? new Date(publishDate).toLocaleDateString() : undefined
    item.sortText = `1-${String(index).padStart(4, '0')}`
    item.range = replaceRange
    item.filterText = version
    if (version === latest) {
      item.detail = `${item.detail ?? ''} ★ latest`.trim()
    }
    return item
  })
  items.push(...versionItems)

  return items
}
