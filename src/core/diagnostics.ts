/**
 * Diagnostics orchestrator — the core differentiator.
 * Automatically analyzes open manifest files (npm package.json, Python
 * requirements*.txt) and reports outdated dependencies as native VS Code
 * diagnostics with update-aware severity levels. All format-specific work is
 * delegated to the matched Ecosystem.
 */

import * as vscode from 'vscode'

import { ECOSYSTEMS, ecosystemForDocument } from './ecosystem'
import { DependencyInfo, VersionAnalysis, PackageInfo, TrawlDiagnostic, Ecosystem } from './types'

/** Diagnostic collection for outdated deps */
let diagnosticCollection: vscode.DiagnosticCollection

/** Store analysis results for use by other providers (hover, code actions) */
const analysisCache = new Map<string, Map<string, { dep: DependencyInfo; analysis: VersionAnalysis; info: PackageInfo }>>()

export function getAnalysisCache(): Map<string, Map<string, { dep: DependencyInfo; analysis: VersionAnalysis; info: PackageInfo }>> {
  return analysisCache
}

/**
 * Initialize the diagnostics system. Called from extension activate().
 */
export function initDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('trawl')
  context.subscriptions.push(diagnosticCollection)

  // Analyze all currently open manifest files
  for (const editor of vscode.window.visibleTextEditors) {
    analyzeIfMatched(editor.document)
  }

  // Watch for newly opened manifest files
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      analyzeIfMatched(doc)
    })
  )

  // Watch for changes to manifest files (debounced)
  const DEBOUNCE_MS = 1000
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const ecosystem = ecosystemForDocument(event.document)
      if (!ecosystem) return
      if (changeTimer) clearTimeout(changeTimer)
      changeTimer = setTimeout(() => {
        analyzeDocument(event.document, ecosystem)
      }, DEBOUNCE_MS)
    })
  )

  // Watch for saved manifest files
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      analyzeIfMatched(doc)
    })
  )

  // Clean up diagnostics when a file is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (ecosystemForDocument(doc)) {
        diagnosticCollection.delete(doc.uri)
        analysisCache.delete(doc.uri.toString())
      }
    })
  )

  // Watch for workspace folder changes (monorepo support)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      scanWorkspace()
    })
  )

  // Initial workspace scan
  scanWorkspace()

  return diagnosticCollection
}

function analyzeIfMatched(document: vscode.TextDocument): void {
  const ecosystem = ecosystemForDocument(document)
  if (ecosystem) analyzeDocument(document, ecosystem)
}

/**
 * Scan the workspace for all supported manifest files and analyze them.
 * Provides monorepo support by finding every manifest per ecosystem.
 */
async function scanWorkspace(): Promise<void> {
  const config = vscode.workspace.getConfiguration('trawl')
  if (!config.get<boolean>('enableDiagnostics', true)) return

  const MAX_FILE_SEARCH = 50
  for (const ecosystem of ECOSYSTEMS) {
    const files = await vscode.workspace.findFiles(
      ecosystem.workspaceGlob,
      ecosystem.workspaceExcludeGlob ?? undefined,
      MAX_FILE_SEARCH
    )
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file)
        analyzeDocument(doc, ecosystem)
      }
      catch {
        // Skip files that can't be opened
      }
    }
  }
}

/**
 * Analyze a single manifest document and set diagnostics.
 */
async function analyzeDocument(document: vscode.TextDocument, ecosystem: Ecosystem): Promise<void> {
  const config = vscode.workspace.getConfiguration('trawl')
  if (!config.get<boolean>('enableDiagnostics', true)) return

  const ignoredPackages = config.get<string[]>('ignoredPackages', [])
  const concurrency = config.get<number>('concurrency', 6)

  const deps = ecosystem.parseDependencies(document)
  if (deps.length === 0) {
    diagnosticCollection.set(document.uri, [])
    return
  }

  // Filter out ignored packages and non-comparable references
  const filteredDeps = deps.filter((d) => !ignoredPackages.includes(d.name) && !ecosystem.shouldSkip(d))
  const packageNames = [...new Set(filteredDeps.map((d) => d.name))]

  // Prefetch all packages concurrently
  const packageInfoMap = await ecosystem.prefetchPackages(packageNames, concurrency)

  // Schedule background refresh for next time
  ecosystem.scheduleBackgroundRefresh(packageNames)

  const diagnostics: vscode.Diagnostic[] = []
  const docAnalysis = new Map<string, { dep: DependencyInfo; analysis: VersionAnalysis; info: PackageInfo }>()

  for (const dep of filteredDeps) {
    const info = packageInfoMap.get(dep.name)
    if (!info) continue

    const analysis = ecosystem.analyzeVersion(dep.versionRange, info)

    // Store for hover/code action providers
    docAnalysis.set(dep.name, { dep, analysis, info })

    if (analysis.isUpToDate || analysis.updateType === 'none') {
      continue
    }

    // Create diagnostic with update-aware severity
    const severity = getSeverity(analysis.updateType)
    const suggested = ecosystem.suggestVersionUpdate(dep.versionRange, analysis.latest)

    const range = new vscode.Range(
      dep.line,
      dep.versionStartChar,
      dep.line,
      dep.versionEndChar
    )

    const message = formatDiagnosticMessage(dep, analysis)

    const diagnostic = new vscode.Diagnostic(range, message, severity)
    diagnostic.source = 'trawl'
    diagnostic.code = {
      value: analysis.updateType,
      target: vscode.Uri.parse(ecosystem.packageUrl(dep.name)),
    };

    // Store metadata for quick-fix code actions
    (diagnostic as TrawlDiagnostic)._depName = dep.name;
    (diagnostic as TrawlDiagnostic)._suggestedVersion = suggested;
    (diagnostic as TrawlDiagnostic)._latestVersion = analysis.latest;
    (diagnostic as TrawlDiagnostic)._maxSatisfying = analysis.maxSatisfying ?? undefined

    diagnostics.push(diagnostic)
  }

  analysisCache.set(document.uri.toString(), docAnalysis)
  diagnosticCollection.set(document.uri, diagnostics)
}

/**
 * Map update type to VS Code diagnostic severity.
 */
function getSeverity(updateType: string): vscode.DiagnosticSeverity {
  switch (updateType) {
  case 'major':
    return vscode.DiagnosticSeverity.Error
  case 'minor':
    return vscode.DiagnosticSeverity.Warning
  case 'patch':
    return vscode.DiagnosticSeverity.Information
  case 'prerelease':
    return vscode.DiagnosticSeverity.Hint
  default:
    return vscode.DiagnosticSeverity.Information
  }
}

/**
 * Format a human-readable diagnostic message.
 */
function formatDiagnosticMessage(
  dep: DependencyInfo,
  analysis: VersionAnalysis
): string {
  const updateLabel = analysis.updateType.charAt(0).toUpperCase() + analysis.updateType.slice(1)
  let msg = `${updateLabel} update available for ${dep.name}: ${analysis.latest}`

  if (analysis.maxSatisfying && analysis.maxSatisfying !== analysis.latest) {
    msg += ` (current range max: ${analysis.maxSatisfying})`
  }

  return msg
}

/**
 * Force re-analysis of all open manifest documents.
 * Used by the "Refresh Cache" command.
 */
export async function refreshAllDiagnostics(): Promise<void> {
  for (const editor of vscode.window.visibleTextEditors) {
    const ecosystem = ecosystemForDocument(editor.document)
    if (ecosystem) {
      await analyzeDocument(editor.document, ecosystem)
    }
  }
  // Also re-scan workspace
  await scanWorkspace()
}
