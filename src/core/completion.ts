/**
 * Version autocomplete provider.
 * When the cursor is inside a version value of a dependency, suggests real
 * registry versions via the standard VS Code autocomplete dropdown. The set
 * of items is built by the matched ecosystem.
 */

import * as vscode from 'vscode'

import { ecosystemForDocument } from './ecosystem'


export class VersionCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | undefined> {
    const ecosystem = ecosystemForDocument(document)
    if (!ecosystem) return undefined

    const config = vscode.workspace.getConfiguration('trawl')
    if (!config.get<boolean>('enableVersionAutocomplete', true)) return undefined

    // Check if the cursor is inside a version value in a dep group
    const deps = ecosystem.parseDependencies(document)
    const dep = ecosystem.getDependencyAtVersion(document, position, deps)
    if (!dep) return undefined

    // Fetch available versions for this package
    const packageInfo = await ecosystem.getPackageInfo(dep.name)
    if (!packageInfo || packageInfo.versions.length === 0) return undefined

    // The replacement range is the entire version string
    const replaceRange = new vscode.Range(
      dep.line,
      dep.versionStartChar,
      dep.line,
      dep.versionEndChar
    )

    return ecosystem.buildCompletionItems(dep, packageInfo, replaceRange)
  }
}
