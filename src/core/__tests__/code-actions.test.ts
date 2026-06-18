import * as vscode from 'vscode'

import { VersionQuickFixProvider } from '../code-actions'
import { ecosystemForDocument } from '../ecosystem'
import { TrawlDiagnostic } from '../types'

import { createMockDocument, makeFakeEcosystem } from './test-helpers'


jest.mock('../ecosystem', () => ({
  ecosystemForDocument: jest.fn(),
}))

const mockedEcosystemForDocument = jest.mocked(ecosystemForDocument)

interface WorkspaceEditWithReplacements {
  replacements: Array<{ uri: vscode.Uri; range: vscode.Range; newText: string }>
}

const VERSION_START_CHAR = 15
const VERSION_END_CHAR = 23
const MOCK_RANGE_END_CHAR = 30

function createTrawlDiagnostic(overrides: Partial<TrawlDiagnostic> = {}): TrawlDiagnostic {
  const range = new vscode.Range(2, VERSION_START_CHAR, 2, VERSION_END_CHAR)
  const diagnostic = new vscode.Diagnostic(range, 'Major update available: 5.0.0', vscode.DiagnosticSeverity.Error) as TrawlDiagnostic
  diagnostic.source = 'trawl'
  diagnostic._depName = 'lodash'
  diagnostic._suggestedVersion = '^5.0.0'
  diagnostic._latestVersion = '5.0.0'
  diagnostic._maxSatisfying = '4.17.21'
  Object.assign(diagnostic, overrides)
  return diagnostic
}

function createMockCodeActionContext(diagnostics: vscode.Diagnostic[]): vscode.CodeActionContext {
  return { diagnostics, triggerKind: 1, only: undefined } as unknown as vscode.CodeActionContext
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem())
})

describe('VersionQuickFixProvider.provideCodeActions', () => {
  const provider = new VersionQuickFixProvider()
  const mockRange = new vscode.Range(2, 0, 2, MOCK_RANGE_END_CHAR)
  const mockToken = {} as vscode.CancellationToken

  it('returns empty array when no trawl diagnostics are in range', () => {
    const nonTrawlDiagnostic = new vscode.Diagnostic(mockRange, 'Some other issue', vscode.DiagnosticSeverity.Warning)
    nonTrawlDiagnostic.source = 'eslint'
    const context = createMockCodeActionContext([nonTrawlDiagnostic])

    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(0)
  })

  it('ignores diagnostics with source !== trawl', () => {
    const diagnostic = createTrawlDiagnostic()
    diagnostic.source = 'typescript'
    const context = createMockCodeActionContext([diagnostic])

    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(0)
  })

  it('returns empty array for documents owned by no ecosystem', () => {
    mockedEcosystemForDocument.mockReturnValue(undefined)
    const context = createMockCodeActionContext([createTrawlDiagnostic()])

    const actions = provider.provideCodeActions(createMockDocument('/project/other.json'), mockRange, context, mockToken)
    expect(actions).toHaveLength(0)
  })

  it('returns 3 code actions per trawl diagnostic', () => {
    const context = createMockCodeActionContext([createTrawlDiagnostic()])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(3)
  })

  it('update action has suggestedVersion, isPreferred=true, and a WorkspaceEdit', () => {
    const context = createMockCodeActionContext([createTrawlDiagnostic()])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    const updateAction = actions[0]

    expect(updateAction.title).toContain('^5.0.0')
    expect(updateAction.isPreferred).toBe(true)
    expect(updateAction.edit).toBeInstanceOf(vscode.WorkspaceEdit)
  })

  it('update action WorkspaceEdit replaces with the suggested version', () => {
    const diagnostic = createTrawlDiagnostic()
    const context = createMockCodeActionContext([diagnostic])
    const document = createMockDocument()
    const actions = provider.provideCodeActions(document, mockRange, context, mockToken)

    const edit = actions[0].edit as unknown as WorkspaceEditWithReplacements
    expect(edit.replacements).toHaveLength(1)
    expect(edit.replacements[0].uri).toEqual(document.uri)
    expect(edit.replacements[0].range).toEqual(diagnostic.range)
    expect(edit.replacements[0].newText).toBe('^5.0.0')
  })

  it('pin action uses latestVersion verbatim for npm', () => {
    const diagnostic = createTrawlDiagnostic()
    const context = createMockCodeActionContext([diagnostic])
    const document = createMockDocument()
    const actions = provider.provideCodeActions(document, mockRange, context, mockToken)
    const pinAction = actions[1]

    expect(pinAction.title).toContain('5.0.0')
    const edit = pinAction.edit as unknown as WorkspaceEditWithReplacements
    expect(edit.replacements[0].newText).toBe('5.0.0')
  })

  it('pin action prefixes == for python', () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({ id: 'python', registryName: 'PyPI' }))
    const context = createMockCodeActionContext([createTrawlDiagnostic()])
    const actions = provider.provideCodeActions(createMockDocument('/project/requirements.txt'), mockRange, context, mockToken)

    const edit = actions[1].edit as unknown as WorkspaceEditWithReplacements
    expect(edit.replacements[0].newText).toBe('==5.0.0')
  })

  it('open action uses the vscode.open command with the registry URL', () => {
    const context = createMockCodeActionContext([createTrawlDiagnostic()])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    const openAction = actions[2]

    expect(openAction.title).toContain('lodash')
    expect(openAction.command?.command).toBe('vscode.open')
    expect(openAction.command?.arguments).toBeDefined()
  })

  it('skips diagnostics missing _depName', () => {
    const diagnostic = createTrawlDiagnostic()
    ;(diagnostic as unknown as Record<string, unknown>)._depName = undefined
    const context = createMockCodeActionContext([diagnostic])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(0)
  })

  it('skips diagnostics missing _latestVersion', () => {
    const diagnostic = createTrawlDiagnostic()
    ;(diagnostic as unknown as Record<string, unknown>)._latestVersion = undefined
    const context = createMockCodeActionContext([diagnostic])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(0)
  })

  it('skips the update action when _suggestedVersion is missing but keeps pin and open', () => {
    const diagnostic = createTrawlDiagnostic()
    ;(diagnostic as unknown as Record<string, unknown>)._suggestedVersion = undefined
    const context = createMockCodeActionContext([diagnostic])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(2)
  })

  it('returns actions for multiple diagnostics', () => {
    const diagnostic1 = createTrawlDiagnostic({ _depName: 'lodash', _latestVersion: '5.0.0', _suggestedVersion: '^5.0.0' })
    const diagnostic2 = createTrawlDiagnostic({ _depName: 'react', _latestVersion: '19.0.0', _suggestedVersion: '^19.0.0' })
    const context = createMockCodeActionContext([diagnostic1, diagnostic2])
    const actions = provider.provideCodeActions(createMockDocument(), mockRange, context, mockToken)
    expect(actions).toHaveLength(6)
  })
})
