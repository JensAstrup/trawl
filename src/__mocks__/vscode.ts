/**
 * Minimal `vscode` API stub for Jest unit tests. Only the surface used by the
 * modules under test is implemented.
 */

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startChar: number,
    public readonly endLine: number,
    public readonly endChar: number
  ) {}
}

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const

export const CompletionItemKind = {
  Value: 11,
} as const

export class MarkdownString {
  value = ''
  isTrusted = false
  supportHtml = false
  appendMarkdown(text: string): this {
    this.value += text
    return this
  }
}

export class CompletionItem {
  detail: string | undefined
  documentation: MarkdownString | undefined
  sortText: string | undefined
  filterText: string | undefined
  range: Range | undefined
  constructor(public label: string, public kind?: number) {}
}

export const Uri = {
  parse: (value: string): { toString(): string } => ({ toString: () => value }),
}
