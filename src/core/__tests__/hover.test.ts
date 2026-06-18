import * as vscode from 'vscode'

import { getAnalysisCache } from '../diagnostics'
import { ecosystemForDocument } from '../ecosystem'
import { DependencyHoverProvider } from '../hover'

import { createMockAnalysis, createMockDep, createMockDocument, createMockPackageInfo, makeFakeEcosystem } from './test-helpers'


jest.mock('../ecosystem', () => ({
  ecosystemForDocument: jest.fn(),
}))
jest.mock('../diagnostics', () => ({
  getAnalysisCache: jest.fn(() => new Map()),
}))

const mockedEcosystemForDocument = jest.mocked(ecosystemForDocument)
const mockedGetAnalysisCache = jest.mocked(getAnalysisCache)

const MOCK_POSITION_CHAR = 17
const mockPosition = new vscode.Position(2, MOCK_POSITION_CHAR)
const mockToken = {} as vscode.CancellationToken

function hoverValue(result: vscode.Hover | undefined): string {
  return (result!.contents as unknown as { value: string }).value
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetAnalysisCache.mockReturnValue(new Map())
  ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
  })
})

describe('DependencyHoverProvider.provideHover', () => {
  const provider = new DependencyHoverProvider()

  it('returns undefined for documents owned by no ecosystem', async () => {
    mockedEcosystemForDocument.mockReturnValue(undefined)
    const result = await provider.provideHover(createMockDocument('/project/other.json'), mockPosition, mockToken)
    expect(result).toBeUndefined()
  })

  it('returns undefined when enableHover is false', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem())
    ;(vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => (key === 'enableHover' ? false : defaultValue)),
    })
    const result = await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    expect(result).toBeUndefined()
  })

  it('returns undefined when no dep is found at position', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtName: jest.fn(() => undefined),
      getDependencyAtVersion: jest.fn(() => undefined),
    }))
    const result = await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    expect(result).toBeUndefined()
  })

  it('returns undefined when getPackageInfo returns null', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(null)),
    }))
    const result = await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    expect(result).toBeUndefined()
  })

  it('prefers dep found by name over dep found by version position', async () => {
    const getPackageInfo = jest.fn(() => Promise.resolve(createMockPackageInfo({ name: 'lodash-by-name' })))
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtName: jest.fn(() => createMockDep({ name: 'lodash-by-name' })),
      getDependencyAtVersion: jest.fn(() => createMockDep({ name: 'lodash-by-version' })),
      getPackageInfo,
      analyzeVersion: jest.fn(() => createMockAnalysis()),
    }))

    await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    expect(getPackageInfo).toHaveBeenCalledWith('lodash-by-name')
  })

  it('uses cached analysis when available without re-fetching', async () => {
    const dep = createMockDep()
    const getPackageInfo = jest.fn(() => Promise.resolve(createMockPackageInfo()))
    const analyzeVersion = jest.fn(() => createMockAnalysis())
    const document = createMockDocument()
    const docCache = new Map([[dep.name, { dep, analysis: createMockAnalysis({ isUpToDate: true, updateType: 'none' }), info: createMockPackageInfo() }]])
    mockedGetAnalysisCache.mockReturnValue(new Map([[document.uri.toString(), docCache]]))
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => dep),
      getPackageInfo,
      analyzeVersion,
    }))

    await provider.provideHover(document, mockPosition, mockToken)

    expect(getPackageInfo).not.toHaveBeenCalled()
    expect(analyzeVersion).not.toHaveBeenCalled()
  })

  it('falls back to fresh analyzeVersion when no cache for dep', async () => {
    const analyzeVersion = jest.fn(() => createMockAnalysis())
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion,
    }))

    await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    expect(analyzeVersion).toHaveBeenCalled()
  })

  it('hover content is a MarkdownString with the package name', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis()),
    }))

    const result = await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    expect(result).toBeInstanceOf(vscode.Hover)
    expect(hoverValue(result)).toContain('lodash')
  })

  it('hover table includes current, latest, status, and group rows', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis()),
      showGroup: true,
    }))

    const value = hoverValue(await provider.provideHover(createMockDocument(), mockPosition, mockToken))
    expect(value).toContain('Current')
    expect(value).toContain('Latest')
    expect(value).toContain('Status')
    expect(value).toContain('Group')
  })

  it('omits the group row when the ecosystem hides it', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis()),
      showGroup: false,
    }))

    const value = hoverValue(await provider.provideHover(createMockDocument(), mockPosition, mockToken))
    expect(value).not.toContain('Group')
  })

  it('status row shows up to date when updateType is none', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis({ isUpToDate: true, updateType: 'none' })),
    }))

    const value = hoverValue(await provider.provideHover(createMockDocument(), mockPosition, mockToken))
    expect(value).toContain('Up to date')
  })

  it('status row shows Major update available for a major update', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis({ isUpToDate: false, updateType: 'major' })),
    }))

    const value = hoverValue(await provider.provideHover(createMockDocument(), mockPosition, mockToken))
    expect(value).toContain('Major update available')
  })

  it('includes the ecosystem hover links', async () => {
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtVersion: jest.fn(() => createMockDep()),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis()),
      hoverLinks: jest.fn(() => '[npm](https://www.npmjs.com/package/lodash)'),
    }))

    const value = hoverValue(await provider.provideHover(createMockDocument(), mockPosition, mockToken))
    expect(value).toContain('[npm]')
  })

  it('hover range uses the name range when hovering by name', async () => {
    const dep = createMockDep({ nameStartChar: 5, nameEndChar: 11, line: 2 })
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtName: jest.fn(() => dep),
      getDependencyAtVersion: jest.fn(() => undefined),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis()),
    }))

    const result = await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    const range = result!.range as vscode.Range
    expect(range.start.character).toBe(dep.nameStartChar)
    expect(range.end.character).toBe(dep.nameEndChar)
  })

  it('hover range uses the version range when hovering by version', async () => {
    const dep = createMockDep({ versionStartChar: 15, versionEndChar: 23, line: 2 })
    mockedEcosystemForDocument.mockReturnValue(makeFakeEcosystem({
      getDependencyAtName: jest.fn(() => undefined),
      getDependencyAtVersion: jest.fn(() => dep),
      getPackageInfo: jest.fn(() => Promise.resolve(createMockPackageInfo())),
      analyzeVersion: jest.fn(() => createMockAnalysis()),
    }))

    const result = await provider.provideHover(createMockDocument(), mockPosition, mockToken)
    const range = result!.range as vscode.Range
    expect(range.start.character).toBe(dep.versionStartChar)
    expect(range.end.character).toBe(dep.versionEndChar)
  })
})
