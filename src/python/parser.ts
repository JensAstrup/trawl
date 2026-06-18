/**
 * Parses pip `requirements*.txt` documents to extract dependency information
 * with precise character positions for diagnostics and code actions.
 *
 * The line-based parsing is exposed as a pure `parseRequirements(text)` for
 * easy testing; `parseDependencies(document)` is the thin VS Code wrapper.
 */

import * as vscode from 'vscode'

import { DependencyInfo } from '../core/types'


/** Synthetic group label for requirements entries (hidden in the hover card) */
const REQUIREMENTS_GROUP = 'requirements'

/** PEP 440 version specifier operators, longest-first so `==` wins over `=` etc. */
const SPECIFIER_OPERATOR = /^(===|==|~=|!=|<=|>=|<|>)/

const NAME_START = /^(\s*)([A-Za-z0-9._-]+)/


/**
 * Parse the raw text of a requirements file into dependency entries.
 * Pure (no VS Code dependency) so it can be unit tested directly.
 */
export function parseRequirements(text: string): DependencyInfo[] {
  const deps: DependencyInfo[] = []
  const lines = text.split('\n')

  lines.forEach((line, lineIndex) => {
    const dep = parseRequirementLine(line, lineIndex)
    if (dep) deps.push(dep)
  })

  return deps
}

function parseRequirementLine(line: string, lineIndex: number): DependencyInfo | null {
  // Strip inline comments: a `#` at line start or preceded by whitespace.
  const commentMatch = line.match(/(^|\s)#/)
  const contentEnd = commentMatch
    ? commentMatch.index! + (commentMatch[1] ? commentMatch[1].length : 0)
    : line.length
  const content = line.slice(0, contentEnd)

  const trimmed = content.trim()
  if (trimmed.length === 0) return null

  // Skip pip directives / options (-r, -c, -e, --hash, ...)
  if (trimmed.startsWith('-')) return null

  // Drop environment markers (everything after `;`)
  const semicolon = content.indexOf(';')
  const installable = semicolon >= 0 ? content.slice(0, semicolon) : content

  // Skip URL / VCS / PEP 508 direct references
  if (/:\/\//.test(installable) || /(^|\s)@\s/.test(installable) || /^\s*[a-z]+\+/.test(installable)) {
    return null
  }

  const nameMatch = installable.match(NAME_START)
  if (!nameMatch) return null

  const leading = nameMatch[1].length
  const name = nameMatch[2]

  // Advance past the name and any optional extras `[...]`
  let cursor = leading + name.length
  cursor = skipWhitespace(installable, cursor)
  if (installable[cursor] === '[') {
    const close = installable.indexOf(']', cursor)
    if (close === -1) return null
    cursor = skipWhitespace(installable, close + 1)
  }

  const rest = installable.slice(cursor)
  if (!SPECIFIER_OPERATOR.test(rest)) return null

  const specifier = rest.trimEnd()
  const versionStartChar = cursor
  const versionEndChar = cursor + specifier.length

  return {
    name,
    versionRange: specifier,
    group: REQUIREMENTS_GROUP,
    line: lineIndex,
    nameStartChar: leading,
    nameEndChar: leading + name.length,
    versionStartChar,
    versionEndChar,
  }
}

function skipWhitespace(text: string, index: number): number {
  const leading = text.slice(index).match(/^[ \t]*/)
  return index + (leading ? leading[0].length : 0)
}

/**
 * Check if a document is a pip requirements file (matched by path, since the
 * language may be `plaintext` or `pip-requirements`).
 */
export function isRequirementsTxt(document: vscode.TextDocument): boolean {
  return /(^|[\\/])requirements[^\\/]*\.txt$/.test(document.fileName)
}

export function parseDependencies(document: vscode.TextDocument): DependencyInfo[] {
  return parseRequirements(document.getText())
}

export function getDependencyAtVersion(
  document: vscode.TextDocument,
  position: vscode.Position,
  deps?: DependencyInfo[]
): DependencyInfo | undefined {
  const allDeps = deps || parseDependencies(document)
  return allDeps.find(
    (dep) =>
      dep.line === position.line &&
      position.character >= dep.versionStartChar &&
      position.character <= dep.versionEndChar
  )
}

export function getDependencyAtName(
  document: vscode.TextDocument,
  position: vscode.Position,
  deps?: DependencyInfo[]
): DependencyInfo | undefined {
  const allDeps = deps || parseDependencies(document)
  return allDeps.find(
    (dep) =>
      dep.line === position.line &&
      position.character >= dep.nameStartChar &&
      position.character <= dep.nameEndChar
  )
}
