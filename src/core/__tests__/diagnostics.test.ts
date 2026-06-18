import * as vscode from 'vscode'

import { shouldSkip as npmShouldSkip } from '../../npm/presentation'
import { initDiagnostics, getAnalysisCache, refreshAllDiagnostics } from '../diagnostics'
import { ECOSYSTEMS, ecosystemForDocument } from '../ecosystem'

import { createMockAnalysis, createMockDep, createMockDocument, createMockPackageInfo, makeFakeEcosystem } from './test-helpers'


jest.mock('../ecosystem', () => ({
  ECOSYSTEMS: [],
  ecosystemForDocument: jest.fn(),
}))

const mockedEcosystemForDocument = jest.mocked(ecosystemForDocument)
const mutableEcosystems = ECOSYSTEMS as unknown as ReturnType<typeof makeFakeEcosystem>[]

const DEBOUNCE_TIMEOUT_MS = 1001

function flushPromises(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(() => setImmediate(resolve))
  })
}

function createMockExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: { push: jest.fn() },
  } as unknown as vscode.ExtensionContext
}

let fakeEcosystem: ReturnType<typeof makeFakeEcosystem>
let mockCollection: { set: jest.Mock; delete: jest.Mock; clear: jest.Mock; dispose: jest.Mock }

beforeEach(() => {
  jest.clearAllMocks()

  mockCollection = { set: jest.fn(), delete: jest.fn(), clear: jest.fn(), dispose: jest.fn() }
  ;(vscode.languages.createDiagnosticCollection as jest.Mock).mockReturnValue(mockCollection)
  ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
  })
  ;(vscode.workspace.findFiles as jest.Mock).mockResolvedValue([])
  ;(vscode.window as unknown as { visibleTextEditors: unknown[] }).visibleTextEditors = []

  fakeEcosystem = makeFakeEcosystem({ shouldSkip: npmShouldSkip })
  fakeEcosystem.analyzeVersion.mockReturnValue(createMockAnalysis({ isUpToDate: true, updateType: 'none' }))

  mutableEcosystems.length = 0
  mutableEcosystems.push(fakeEcosystem)
  mockedEcosystemForDocument.mockReturnValue(fakeEcosystem)
})

describe('initDiagnostics', () => {
  it('registers all 5 workspace event listeners', () => {
    initDiagnostics(createMockExtensionContext())

    expect(vscode.workspace.onDidOpenTextDocument).toHaveBeenCalled()
    expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled()
    expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalled()
    expect(vscode.workspace.onDidCloseTextDocument).toHaveBeenCalled()
    expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalled()
  })

  it('returns the diagnostic collection', () => {
    const collection = initDiagnostics(createMockExtensionContext())
    expect(collection).toBe(mockCollection)
  })
})

describe('analyzeDocument (via onDidOpenTextDocument)', () => {
  function getOpenDocumentCallback(): (doc: vscode.TextDocument) => void {
    return (vscode.workspace.onDidOpenTextDocument as jest.Mock).mock.calls[0][0] as (doc: vscode.TextDocument) => void
  }

  function diagnosticsFor(uri: vscode.Uri): vscode.Diagnostic[] {
    return mockCollection.set.mock.calls.find((call: unknown[]) => call[0] === uri)?.[1] as vscode.Diagnostic[]
  }

  it('skips documents owned by no ecosystem', async () => {
    mockedEcosystemForDocument.mockReturnValue(undefined)
    initDiagnostics(createMockExtensionContext())

    getOpenDocumentCallback()(createMockDocument('/project/tsconfig.json'))
    await flushPromises()

    expect(fakeEcosystem.parseDependencies).not.toHaveBeenCalled()
  })

  it('skips analysis when enableDiagnostics is false', async () => {
    ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => (key === 'enableDiagnostics' ? false : defaultValue)),
    })
    initDiagnostics(createMockExtensionContext())

    getOpenDocumentCallback()(createMockDocument())
    await flushPromises()

    expect(fakeEcosystem.parseDependencies).not.toHaveBeenCalled()
  })

  it('sets empty diagnostics when no deps are found', async () => {
    fakeEcosystem.parseDependencies.mockReturnValue([])
    initDiagnostics(createMockExtensionContext())

    const document = createMockDocument()
    getOpenDocumentCallback()(document)
    await flushPromises()

    expect(mockCollection.set).toHaveBeenCalledWith(document.uri, [])
  })

  it('skips packages listed in ignoredPackages config', async () => {
    fakeEcosystem.parseDependencies.mockReturnValue([createMockDep({ name: 'ignored-pkg' })])
    ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => (key === 'ignoredPackages' ? ['ignored-pkg'] : defaultValue)),
    })
    initDiagnostics(createMockExtensionContext())

    getOpenDocumentCallback()(createMockDocument())
    await flushPromises()

    expect(fakeEcosystem.prefetchPackages).toHaveBeenCalledWith([], expect.any(Number))
  })

  it.each(['file:../local-pkg', 'workspace:^1.0.0', '*', 'latest'])(
    'skips non-comparable version range %s',
    async (versionRange) => {
      fakeEcosystem.parseDependencies.mockReturnValue([createMockDep({ versionRange })])
      fakeEcosystem.prefetchPackages.mockResolvedValue(new Map([['lodash', createMockPackageInfo()]]))
      initDiagnostics(createMockExtensionContext())

      getOpenDocumentCallback()(createMockDocument())
      await flushPromises()

      expect(fakeEcosystem.analyzeVersion).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['major', vscode.DiagnosticSeverity.Error],
    ['minor', vscode.DiagnosticSeverity.Warning],
    ['patch', vscode.DiagnosticSeverity.Information],
    ['prerelease', vscode.DiagnosticSeverity.Hint],
  ] as const)('creates a %s diagnostic with the right severity', async (updateType, severity) => {
    fakeEcosystem.parseDependencies.mockReturnValue([createMockDep()])
    fakeEcosystem.prefetchPackages.mockResolvedValue(new Map([['lodash', createMockPackageInfo()]]))
    fakeEcosystem.analyzeVersion.mockReturnValue(createMockAnalysis({ isUpToDate: false, updateType }))
    initDiagnostics(createMockExtensionContext())

    const document = createMockDocument(`/project/package-${updateType}.json`)
    getOpenDocumentCallback()(document)
    await flushPromises()

    const diagnostics = diagnosticsFor(document.uri)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].severity).toBe(severity)
  })

  it('stores _depName, _suggestedVersion, _latestVersion metadata on the diagnostic', async () => {
    fakeEcosystem.parseDependencies.mockReturnValue([createMockDep()])
    fakeEcosystem.prefetchPackages.mockResolvedValue(new Map([['lodash', createMockPackageInfo()]]))
    fakeEcosystem.analyzeVersion.mockReturnValue(createMockAnalysis({ isUpToDate: false, updateType: 'major', latest: '5.0.0' }))
    fakeEcosystem.suggestVersionUpdate.mockReturnValue('^5.0.0')
    initDiagnostics(createMockExtensionContext())

    const document = createMockDocument('/project/package-meta.json')
    getOpenDocumentCallback()(document)
    await flushPromises()

    const diagnostics = diagnosticsFor(document.uri) as Array<vscode.Diagnostic & { _depName: string; _suggestedVersion: string; _latestVersion: string }>
    expect(diagnostics[0]._depName).toBe('lodash')
    expect(diagnostics[0]._suggestedVersion).toBe('^5.0.0')
    expect(diagnostics[0]._latestVersion).toBe('5.0.0')
  })

  it('does not create a diagnostic when the dep is up to date', async () => {
    fakeEcosystem.parseDependencies.mockReturnValue([createMockDep()])
    fakeEcosystem.prefetchPackages.mockResolvedValue(new Map([['lodash', createMockPackageInfo()]]))
    fakeEcosystem.analyzeVersion.mockReturnValue(createMockAnalysis({ isUpToDate: true, updateType: 'none' }))
    initDiagnostics(createMockExtensionContext())

    const document = createMockDocument('/project/package-uptodate.json')
    getOpenDocumentCallback()(document)
    await flushPromises()

    expect(diagnosticsFor(document.uri)).toHaveLength(0)
  })
})

describe('getAnalysisCache', () => {
  it('returns the shared analysis map', () => {
    expect(getAnalysisCache()).toBeInstanceOf(Map)
  })
})

describe('onDidCloseTextDocument', () => {
  it('deletes diagnostics for the closed document', () => {
    initDiagnostics(createMockExtensionContext())

    const document = createMockDocument()
    const onClose = (vscode.workspace.onDidCloseTextDocument as jest.Mock).mock.calls[0][0] as (doc: vscode.TextDocument) => void
    onClose(document)

    expect(mockCollection.delete).toHaveBeenCalledWith(document.uri)
  })
})

describe('debounced onDidChangeTextDocument', () => {
  it('only fires analyzeDocument once after 1000ms of quiet', async () => {
    jest.useFakeTimers()
    fakeEcosystem.parseDependencies.mockReturnValue([])
    initDiagnostics(createMockExtensionContext())

    const onChange = (vscode.workspace.onDidChangeTextDocument as jest.Mock).mock.calls[0][0] as (
      event: { document: vscode.TextDocument }
    ) => void
    const document = createMockDocument()

    onChange({ document })
    onChange({ document })
    onChange({ document })

    expect(fakeEcosystem.parseDependencies).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(DEBOUNCE_TIMEOUT_MS)

    expect(fakeEcosystem.parseDependencies).toHaveBeenCalledTimes(1)

    jest.useRealTimers()
  })
})

describe('refreshAllDiagnostics', () => {
  it('re-analyses all visible editors owned by an ecosystem', async () => {
    const document = createMockDocument()
    ;(vscode.window as unknown as { visibleTextEditors: unknown[] }).visibleTextEditors = [{ document }]

    initDiagnostics(createMockExtensionContext())
    jest.clearAllMocks()
    mockedEcosystemForDocument.mockReturnValue(fakeEcosystem)
    fakeEcosystem.parseDependencies.mockReturnValue([])
    ;(vscode.workspace.findFiles as jest.Mock).mockResolvedValue([])

    await refreshAllDiagnostics()

    expect(fakeEcosystem.parseDependencies).toHaveBeenCalledWith(document)
  })
})
