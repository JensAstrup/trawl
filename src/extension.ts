/**
 * Extension entry point.
 * Wires together all providers and commands across every ecosystem.
 */

import * as vscode from 'vscode'

import { VersionQuickFixProvider } from './core/code-actions'
import { VersionCompletionProvider } from './core/completion'
import { initDiagnostics, refreshAllDiagnostics } from './core/diagnostics'
import { ECOSYSTEMS } from './core/ecosystem'
import { DependencyHoverProvider } from './core/hover'


export function activate(context: vscode.ExtensionContext): void {
  // Apply initial configuration
  applyConfig()

  // Initialize diagnostics (zero-click warnings)
  initDiagnostics(context)

  const completionProvider = new VersionCompletionProvider()
  const hoverProvider = new DependencyHoverProvider()
  const codeActionProvider = new VersionQuickFixProvider()

  // Register providers once per ecosystem using its document selector
  for (const ecosystem of ECOSYSTEMS) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        ecosystem.documentSelector,
        completionProvider,
        ...ecosystem.completionTriggerCharacters
      )
    )

    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        ecosystem.documentSelector,
        hoverProvider
      )
    )

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        ecosystem.documentSelector,
        codeActionProvider,
        { providedCodeActionKinds: VersionQuickFixProvider.providedCodeActionKinds }
      )
    )
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('trawl.checkOutdated', async () => {
      await refreshAllDiagnostics()
      vscode.window.showInformationMessage('Trawl: Dependencies checked.')
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('trawl.refreshCache', async () => {
      for (const ecosystem of ECOSYSTEMS) ecosystem.clearCache()
      await refreshAllDiagnostics()
      vscode.window.showInformationMessage('Trawl: Cache cleared and dependencies refreshed.')
    })
  )

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('trawl')) {
        applyConfig()
        refreshAllDiagnostics()
      }
    })
  )
}

const DEFAULT_CACHE_TTL_MINUTES = 30

function applyConfig(): void {
  const config = vscode.workspace.getConfiguration('trawl')
  const ttl = config.get<number>('cacheTTLMinutes', DEFAULT_CACHE_TTL_MINUTES)
  for (const ecosystem of ECOSYSTEMS) ecosystem.setCacheTTL(ttl)
}

export function deactivate(): void {
  // Cleanup is handled by disposables in context.subscriptions
}
