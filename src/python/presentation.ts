/**
 * Python-specific presentation: PyPI page URL, completion items
 * (exact / lower-bound / versions), hover links, and the rule for skipping
 * non-comparable specifiers.
 */

import { rcompare, valid } from '@renovatebot/pep440'
import * as vscode from 'vscode'

import { DependencyInfo, PackageInfo } from '../core/types'


const MAX_VERSIONS = 30

export function packageUrl(name: string): string {
  return `https://pypi.org/project/${name}/`
}

/**
 * Skip specifiers that don't reference a concrete version (e.g. exclusion-only
 * `!=` constraints or wildcards with no version number).
 */
export function shouldSkip(dep: DependencyInfo): boolean {
  return !/\d/.test(dep.versionRange)
}

export function hoverLinks(info: PackageInfo): string {
  let links = `[PyPI](${info.registryUrl})`
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
    .filter((v) => valid(v))
    .sort((a, b) => rcompare(a, b))

  const latest = info.latest
  if (latest) {
    const exactItem = new vscode.CompletionItem(`==${latest}`, vscode.CompletionItemKind.Value)
    exactItem.detail = '(latest, exact)'
    exactItem.documentation = new vscode.MarkdownString(`Latest version of **${dep.name}**`)
    exactItem.sortText = '0000'
    exactItem.range = replaceRange
    exactItem.filterText = latest
    items.push(exactItem)

    const lowerBoundItem = new vscode.CompletionItem(`>=${latest}`, vscode.CompletionItemKind.Value)
    lowerBoundItem.detail = '(latest, minimum)'
    lowerBoundItem.sortText = '0001'
    lowerBoundItem.range = replaceRange
    lowerBoundItem.filterText = latest
    items.push(lowerBoundItem)
  }

  const versionItems = sortedVersions
    .filter((version) => version !== latest)
    .slice(0, MAX_VERSIONS)
    .map((version, index) => {
      const publishDate = info.time[version]
      const item = new vscode.CompletionItem(`==${version}`, vscode.CompletionItemKind.Value)
      item.detail = publishDate ? new Date(publishDate).toLocaleDateString() : undefined
      item.sortText = `1-${String(index).padStart(4, '0')}`
      item.range = replaceRange
      item.filterText = version
      return item
    })
  items.push(...versionItems)

  return items
}
