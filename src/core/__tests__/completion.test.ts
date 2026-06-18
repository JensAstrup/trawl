import * as vscode from 'vscode'

import { VersionCompletionProvider } from '../completion'
import { ecosystemForDocument } from '../ecosystem'
import { DependencyInfo, PackageInfo } from '../types'

import { createMockDep, createMockDocument, createMockPackageInfo, makeFakeEcosystem } from './test-helpers'


jest.mock('../ecosystem', () => ({
  ecosystemForDocument: jest.fn(),
}))

const MOCK_POSITION_CHAR = 17
const VERSION_START_CHAR = 15
const VERSION_END_CHAR = 23
const DEP_LINE = 2
const mockPosition = new vscode.Position(2, MOCK_POSITION_CHAR)
const mockToken = {} as vscode.CancellationToken
const mockContext = {} as vscode.CompletionContext

const mockedEcosystemForDocument = jest.mocked(ecosystemForDocument)

beforeEach(() => {
  jest.clearAllMocks()
  ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
  })
})

describe('VersionCompletionProvider.provideCompletionItems', () => {
  const provider = new VersionCompletionProvider()

  it('returns undefined for documents owned by no ecosystem', async () => {
    mockedEcosystemForDocument.mockReturnValue(undefined)
    const result = await provider.provideCompletionItems(createMockDocument('/project/other.json'), mockPosition, mockToken, mockContext)
    expect(result).toBeUndefined()
  })

  it('returns undefined when enableVersionAutocomplete is false', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem())
    ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => (key === 'enableVersionAutocomplete' ? false : defaultValue)),
    })
    const result = await provider.provideCompletionItems(createMockDocument(), mockPosition, mockToken, mockContext)
    expect(result).toBeUndefined()
  })

  it('returns undefined when no dependency is at the cursor position', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => undefined),
    }))
    const result = await provider.provideCompletionItems(createMockDocument(), mockPosition, mockToken, mockContext)
    expect(result).toBeUndefined()
  })

  it('returns undefined when getPackageInfo returns null', async () => {
    const dep = createMockDep()
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => dep),
      getPackageInfo: jest.fn(() => Promise.resolve(null)),
    }))
    const result = await provider.provideCompletionItems(createMockDocument(), mockPosition, mockToken, mockContext)
    expect(result).toBeUndefined()
  })

  it('returns undefined when packageInfo has no versions', async () => {
    const dep = createMockDep()
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => dep),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo({ versions: [] }))),
    }))
    const result = await provider.provideCompletionItems(createMockDocument(), mockPosition, mockToken, mockContext)
    expect(result).toBeUndefined()
  })

  it('delegates item building to the ecosystem with the version replacement range', async () => {
    const dep = createMockDep({ versionStartChar: VERSION_START_CHAR, versionEndChar: VERSION_END_CHAR, line: DEP_LINE })
    const sentinel = [new vscode.CompletionItem('^5.0.0', vscode.CompletionItemKind.Value)]
    const buildCompletionItems = jest.fn((_dep: DependencyInfo, _info: PackageInfo, _range: vscode.Range) => sentinel)
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => dep),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      buildCompletionItems,
    }))

    const result = await provider.provideCompletionItems(createMockDocument(), mockPosition, mockToken, mockContext)

    expect(result).toBe(sentinel)
    const replaceRange = buildCompletionItems.mock.calls[0][2]
    expect(replaceRange.start.line).toBe(DEP_LINE)
    expect(replaceRange.start.character).toBe(VERSION_START_CHAR)
    expect(replaceRange.end.character).toBe(VERSION_END_CHAR)
  })
})
