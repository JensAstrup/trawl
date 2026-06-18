/**
 * Code Action provider — offers quick-fix actions to update dependency
 * versions directly in the editor. Works for any ecosystem via the
 * TrawlDiagnostic metadata attached during analysis.
 */

import * as vscode from 'vscode'

import { ecosystemForDocument } from './ecosystem'
import { TrawlDiagnostic } from './types'


export class VersionQuickFixProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const ecosystem = ecosystemForDocument(document)
    if (!ecosystem) return []

    const actions: vscode.CodeAction[] = []

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'trawl') continue

      const depName = (diagnostic as TrawlDiagnostic)._depName
      const suggestedVersion = (diagnostic as TrawlDiagnostic)._suggestedVersion
      const latestVersion = (diagnostic as TrawlDiagnostic)._latestVersion

      if (!depName || !latestVersion) continue

      // Action: Update to latest version (preserving prefix/operator)
      if (suggestedVersion) {
        const updateToLatest = new vscode.CodeAction(
          `Update ${depName} to ${suggestedVersion}`,
          vscode.CodeActionKind.QuickFix
        )
        updateToLatest.edit = new vscode.WorkspaceEdit()
        updateToLatest.edit.replace(document.uri, diagnostic.range, suggestedVersion)
        updateToLatest.isPreferred = true
        updateToLatest.diagnostics = [diagnostic]
        actions.push(updateToLatest)
      }

      // Action: Pin to exact latest version
      {
        const pinned = ecosystem.id === 'python' ? `==${latestVersion}` : latestVersion
        const pinToLatest = new vscode.CodeAction(
          `Pin ${depName} to exact ${latestVersion}`,
          vscode.CodeActionKind.QuickFix
        )
        pinToLatest.edit = new vscode.WorkspaceEdit()
        pinToLatest.edit.replace(document.uri, diagnostic.range, pinned)
        pinToLatest.diagnostics = [diagnostic]
        actions.push(pinToLatest)
      }

      // Action: Open the registry page
      {
        const openPage = new vscode.CodeAction(
          `Open ${depName} on ${ecosystem.registryName}`,
          vscode.CodeActionKind.QuickFix
        )
        openPage.command = {
          title: `Open ${depName} on ${ecosystem.registryName}`,
          command: 'vscode.open',
          arguments: [vscode.Uri.parse(ecosystem.packageUrl(depName))],
        }
        openPage.diagnostics = [diagnostic]
        actions.push(openPage)
      }
    }

    return actions
  }
}
