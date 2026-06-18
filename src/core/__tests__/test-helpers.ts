import * as vscode from 'vscode'

import { DependencyInfo, Ecosystem, PackageInfo, VersionAnalysis } from '../types'


/**
 * Build a stub Ecosystem whose methods are jest mocks, so core providers can be
 * tested in isolation from npm/PyPI. Override individual fields as needed.
 */
export function makeFakeEcosystem(overrides: Partial<Ecosystem> = {}): jest.Mocked<Ecosystem> {
  const ecosystem = {
    id: 'npm',
    registryName: 'npm',
    documentSelector: { language: 'json', pattern: '**/package.json' },
    completionTriggerCharacters: [],
    workspaceGlob: '**/package.json',
    workspaceExcludeGlob: '**/node_modules/**',
    showGroup: true,

    matches: jest.fn(() => true),
    parseDependencies: jest.fn(() => []),
    getDependencyAtVersion: jest.fn(() => undefined),
    getDependencyAtName: jest.fn(() => undefined),

    getPackageInfo: jest.fn(() => Promise.resolve(null)),
    prefetchPackages: jest.fn(() => Promise.resolve(new Map<string, PackageInfo>())),
    scheduleBackgroundRefresh: jest.fn(),
    clearCache: jest.fn(),
    setCacheTTL: jest.fn(),

    analyzeVersion: jest.fn(),
    suggestVersionUpdate: jest.fn(() => '^5.0.0'),
    shouldSkip: jest.fn(() => false),

    packageUrl: jest.fn((name: string) => `https://www.npmjs.com/package/${name}`),
    buildCompletionItems: jest.fn(() => []),
    hoverLinks: jest.fn((info: PackageInfo) => `[npm](${info.registryUrl})`),

    ...overrides,
  }
  return ecosystem as unknown as jest.Mocked<Ecosystem>
}

export function createMockDocument(fileName = '/project/package.json', languageId = 'json'): vscode.TextDocument {
  return {
    uri: vscode.Uri.file(fileName),
    fileName,
    languageId,
    getText: jest.fn(() => '{}'),
  } as unknown as vscode.TextDocument
}

export function createMockDep(overrides: Partial<DependencyInfo> = {}): DependencyInfo {
  return {
    name: 'lodash',
    versionRange: '^4.17.21',
    group: 'dependencies',
    line: 2,
    nameStartChar: 5,
    nameEndChar: 11,
    versionStartChar: 15,
    versionEndChar: 23,
    ...overrides,
  }
}

export function createMockPackageInfo(overrides: Partial<PackageInfo> = {}): PackageInfo {
  return {
    name: 'lodash',
    versions: ['4.17.21', '5.0.0'],
    latest: '5.0.0',
    distTags: { latest: '5.0.0' },
    time: { '5.0.0': '2023-01-15T00:00:00.000Z' },
    description: 'A utility library',
    registryUrl: 'https://www.npmjs.com/package/lodash',
    ...overrides,
  }
}

export function createMockAnalysis(overrides: Partial<VersionAnalysis> = {}): VersionAnalysis {
  return {
    currentRange: '^4.17.21',
    maxSatisfying: '4.17.21',
    latest: '5.0.0',
    isUpToDate: false,
    updateType: 'major',
    ...overrides,
  }
}
