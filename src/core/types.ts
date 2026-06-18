/**
 * Ecosystem-agnostic types shared across the extension core.
 */

import type * as vscode from 'vscode'


export interface DependencyInfo {
  /** The package name */
  name: string;
  /** The version range/specifier string (e.g., "^2.0.0" or "==2.31.0") */
  versionRange: string;
  /** Which dependency group this belongs to (ecosystem-specific label) */
  group: string;
  /** Line number in the document (0-based) */
  line: number;
  /** Start character of the version string value */
  versionStartChar: number;
  /** End character of the version string value */
  versionEndChar: number;
  /** Start character of the package name */
  nameStartChar: number;
  /** End character of the package name */
  nameEndChar: number;
}

export interface PackageInfo {
  /** The package name */
  name: string;
  /** All available versions */
  versions: string[];
  /** The absolute latest version */
  latest: string;
  /** Optional dist-tags (npm only; e.g. latest, next) */
  distTags?: Record<string, string>;
  /** Publish timestamps per version */
  time: Record<string, string>;
  /** Description of the package */
  description?: string;
  /** Homepage URL */
  homepage?: string;
  /** Public registry page URL (npm/PyPI) */
  registryUrl: string;
}

export interface CachedPackageInfo {
  data: PackageInfo;
  fetchedAt: number;
}

export interface VersionAnalysis {
  /** The current range/specifier */
  currentRange: string;
  /** The highest version satisfying the current range */
  maxSatisfying: string | null;
  /** The absolute latest version */
  latest: string;
  /** Whether the current range already covers the latest */
  isUpToDate: boolean;
  /** What type of update is available */
  updateType: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  /** Last publish date of the latest version */
  latestPublishDate?: string;
}

export interface TrawlDiagnostic extends vscode.Diagnostic {
  _depName: string
  _suggestedVersion: string | undefined
  _latestVersion: string
  _maxSatisfying: string | undefined
}

/**
 * An ecosystem encapsulates everything format-specific: how to recognize and
 * parse its manifest files, how to fetch package metadata, how to compare
 * versions, and how to present results. The core orchestrator and providers
 * are written against this interface so they never reference npm/PyPI directly.
 */
export interface Ecosystem {
  /** Stable identifier, e.g. 'npm' | 'python' */
  id: string;
  /** Human-readable registry name for UI labels, e.g. 'npm' | 'PyPI' */
  registryName: string;
  /** Document selector used when registering providers */
  documentSelector: vscode.DocumentSelector;
  /** Extra completion trigger characters specific to this ecosystem */
  completionTriggerCharacters: string[];
  /** Glob used to discover manifest files across the workspace */
  workspaceGlob: string;
  /** Glob of paths to exclude from the workspace scan (or null for none) */
  workspaceExcludeGlob: string | null;
  /** Whether the hover card should show the dependency group label */
  showGroup: boolean;

  /** True when this ecosystem owns the given document */
  matches(document: vscode.TextDocument): boolean;

  parseDependencies(document: vscode.TextDocument): DependencyInfo[];
  getDependencyAtVersion(document: vscode.TextDocument, position: vscode.Position, deps?: DependencyInfo[]): DependencyInfo | undefined;
  getDependencyAtName(document: vscode.TextDocument, position: vscode.Position, deps?: DependencyInfo[]): DependencyInfo | undefined;

  getPackageInfo(name: string): Promise<PackageInfo | null>;
  prefetchPackages(names: string[], concurrency: number): Promise<Map<string, PackageInfo>>;
  scheduleBackgroundRefresh(names: string[]): void;
  clearCache(): void;
  setCacheTTL(minutes: number): void;

  analyzeVersion(range: string, info: PackageInfo): VersionAnalysis;
  suggestVersionUpdate(range: string, targetVersion: string): string;
  /** Skip non-comparable references (local/VCS/url, unpinned, etc.) */
  shouldSkip(dep: DependencyInfo): boolean;

  /** Public registry page URL for a package */
  packageUrl(name: string): string;
  /** Build completion items offered inside a version value */
  buildCompletionItems(dep: DependencyInfo, info: PackageInfo, replaceRange: vscode.Range): vscode.CompletionItem[];
  /** Markdown links row for the hover card */
  hoverLinks(info: PackageInfo): string;
}

const HttpStatusCode = {
  OK: 200,
  MULTIPLE_CHOICES: 300,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
}


export { HttpStatusCode }
