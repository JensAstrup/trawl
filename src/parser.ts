/**
 * Parses package.json documents to extract dependency information
 * with precise character positions for diagnostics and code actions.
 */

import * as vscode from 'vscode';
import { DependencyInfo, DependencyGroup, DEPENDENCY_GROUPS } from './types';

/**
 * Parse a package.json TextDocument and extract all dependency entries
 * with their exact positions in the file.
 */
export function parseDependencies(document: vscode.TextDocument): DependencyInfo[] {
  const text = document.getText();
  const deps: DependencyInfo[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    // If the JSON is invalid, we can't parse dependencies
    return deps;
  }

  for (const group of DEPENDENCY_GROUPS) {
    const groupObj = parsed[group];
    if (!groupObj || typeof groupObj !== 'object') {
      continue;
    }

    // Find the position of this group key in the document
    const groupDeps = groupObj as Record<string, string>;

    for (const [name, version] of Object.entries(groupDeps)) {
      if (typeof version !== 'string') continue;

      const positions = findDependencyPosition(document, group, name, version);
      if (positions) {
        deps.push({
          name,
          versionRange: version,
          group,
          ...positions,
        });
      }
    }
  }

  return deps;
}

interface PositionInfo {
  line: number;
  versionStartChar: number;
  versionEndChar: number;
  nameStartChar: number;
  nameEndChar: number;
}

/**
 * Find the exact position of a dependency entry within a specific group.
 * We search for the pattern `"name": "version"` within the group block.
 */
function findDependencyPosition(
  document: vscode.TextDocument,
  group: DependencyGroup,
  name: string,
  version: string
): PositionInfo | null {
  const text = document.getText();

  // Find the group key in the document
  const groupPattern = new RegExp(`"${escapeRegex(group)}"\\s*:\\s*\\{`);
  const groupMatch = groupPattern.exec(text);
  if (!groupMatch) return null;

  const groupStart = groupMatch.index + groupMatch[0].length;

  // Find the matching closing brace for this group
  let braceDepth = 1;
  let groupEnd = groupStart;
  for (let i = groupStart; i < text.length && braceDepth > 0; i++) {
    if (text[i] === '{') braceDepth++;
    else if (text[i] === '}') braceDepth--;
    groupEnd = i;
  }

  const groupText = text.substring(groupStart, groupEnd);

  // Search for the dependency name within the group
  // Match `"name"` as a key — ensure we find the key, not a value
  const nameEscaped = escapeRegex(name);
  const depPattern = new RegExp(
    `"(${nameEscaped})"\\s*:\\s*"([^"]*)"`,
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = depPattern.exec(groupText)) !== null) {
    const matchedName = match[1];
    const matchedVersion = match[2];

    if (matchedName === name && matchedVersion === version) {
      const absoluteOffset = groupStart + match.index;
      const pos = document.positionAt(absoluteOffset);

      // Find the exact positions of name and version within the match
      const fullMatch = match[0];
      const nameQuoteStart = fullMatch.indexOf('"') + 1;
      const nameQuoteEnd = nameQuoteStart + name.length;

      // Find the version string position (second quoted string)
      const afterColon = fullMatch.indexOf(':', nameQuoteEnd);
      const versionQuoteStart = fullMatch.indexOf('"', afterColon + 1) + 1;
      const versionQuoteEnd = versionQuoteStart + version.length;

      const lineText = document.lineAt(pos.line).text;
      const lineOffset = document.offsetAt(new vscode.Position(pos.line, 0));
      const matchStartInLine = absoluteOffset - lineOffset;

      return {
        line: pos.line,
        nameStartChar: matchStartInLine + nameQuoteStart,
        nameEndChar: matchStartInLine + nameQuoteEnd,
        versionStartChar: matchStartInLine + versionQuoteStart,
        versionEndChar: matchStartInLine + versionQuoteEnd,
      };
    }
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a document is a package.json file.
 */
export function isPackageJson(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'json' &&
    document.fileName.endsWith('package.json')
  );
}

/**
 * Determine if a position in a document is inside a version value string
 * within a dependency group. Returns the dependency info if found.
 */
export function getDependencyAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  deps?: DependencyInfo[]
): DependencyInfo | undefined {
  const allDeps = deps || parseDependencies(document);
  return allDeps.find(
    (dep) =>
      dep.line === position.line &&
      position.character >= dep.versionStartChar &&
      position.character <= dep.versionEndChar
  );
}

/**
 * Determine if a position is on a dependency name (key).
 */
export function getDependencyByName(
  document: vscode.TextDocument,
  position: vscode.Position,
  deps?: DependencyInfo[]
): DependencyInfo | undefined {
  const allDeps = deps || parseDependencies(document);
  return allDeps.find(
    (dep) =>
      dep.line === position.line &&
      position.character >= dep.nameStartChar &&
      position.character <= dep.nameEndChar
  );
}
