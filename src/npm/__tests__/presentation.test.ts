import * as vscode from 'vscode'

import { DependencyInfo, PackageInfo } from '../../core/types'
import { buildCompletionItems, hoverLinks, packageUrl, shouldSkip, MAX_VERSIONS } from '../presentation'


const VERSION_START_CHAR = 15
const VERSION_END_CHAR = 23

function createMockDep(overrides: Partial<DependencyInfo> = {}): DependencyInfo {
  return {
    name: 'lodash',
    versionRange: '^4.17.21',
    group: 'dependencies',
    line: 2,
    nameStartChar: 5,
    nameEndChar: 11,
    versionStartChar: VERSION_START_CHAR,
    versionEndChar: VERSION_END_CHAR,
    ...overrides,
  }
}

function createMockPackageInfo(overrides: Partial<PackageInfo> = {}): PackageInfo {
  return {
    name: 'lodash',
    versions: ['4.17.21', '4.18.0', '5.0.0'],
    latest: '5.0.0',
    distTags: { latest: '5.0.0' },
    time: {
      '4.17.21': '2020-01-01T00:00:00.000Z',
      '4.18.0': '2021-06-01T00:00:00.000Z',
      '5.0.0': '2023-01-15T00:00:00.000Z',
    },
    registryUrl: 'https://www.npmjs.com/package/lodash',
    ...overrides,
  }
}

function buildItems(packageInfo = createMockPackageInfo()): vscode.CompletionItem[] {
  const dep = createMockDep()
  const range = new vscode.Range(dep.line, dep.versionStartChar, dep.line, dep.versionEndChar)
  return buildCompletionItems(dep, packageInfo, range)
}

describe('buildCompletionItems', () => {
  it('includes ^latest item as the first suggestion with sortText 0000', () => {
    const items = buildItems()
    expect(items[0].label).toBe('^5.0.0')
    expect(items[0].sortText).toBe('0000')
  })

  it('includes exact latest item with sortText 0001', () => {
    const exactItem = buildItems().find((item) => item.sortText === '0001')
    expect(exactItem?.label).toBe('5.0.0')
  })

  it('includes ~latest item with sortText 0002', () => {
    const tildeItem = buildItems().find((item) => item.sortText === '0002')
    expect(tildeItem?.label).toBe('~5.0.0')
  })

  it('includes other dist-tags before individual versions', () => {
    const items = buildItems(createMockPackageInfo({
      distTags: { latest: '5.0.0', next: '6.0.0-alpha.1', beta: '5.1.0-beta.1' },
    }))
    const nextItem = items.find((item) => item.sortText?.startsWith('01-next'))
    const betaItem = items.find((item) => item.sortText?.startsWith('01-beta'))
    expect(nextItem).toBeDefined()
    expect(betaItem).toBeDefined()
  })

  it('individual versions are sorted newest-first', () => {
    const versionItems = buildItems().filter((item) => item.sortText?.startsWith('1-'))
    expect(versionItems[0].label).toBe('^5.0.0')
  })

  it('limits individual versions to MAX_VERSIONS (30)', () => {
    const manyVersions = Array.from({ length: 50 }, (_, i) => `1.${i}.0`)
    const items = buildItems(createMockPackageInfo({ versions: manyVersions, latest: '1.49.0', distTags: { latest: '1.49.0' } }))
    const versionItems = items.filter((item) => item.sortText?.startsWith('1-'))
    expect(versionItems.length).toBeLessThanOrEqual(MAX_VERSIONS)
  })

  it('sets the replacement range to the entire version string', () => {
    const items = buildItems()
    const range = items[0].range as vscode.Range
    expect(range.start.line).toBe(2)
    expect(range.start.character).toBe(VERSION_START_CHAR)
    expect(range.end.line).toBe(2)
    expect(range.end.character).toBe(VERSION_END_CHAR)
  })

  it('sets filterText to the version without prefix', () => {
    expect(buildItems()[0].filterText).toBe('5.0.0')
  })

  it('includes publish date in detail for version items when available', () => {
    const items = buildItems(createMockPackageInfo({
      versions: ['5.0.0'],
      latest: '5.0.0',
      distTags: { latest: '5.0.0' },
      time: { '5.0.0': '2023-01-15T00:00:00.000Z' },
    }))
    const versionItems = items.filter((item) => item.sortText?.startsWith('1-'))
    expect(versionItems[0].detail).toBeDefined()
    expect(typeof versionItems[0].detail).toBe('string')
  })

  it('returns no items when latest and versions are empty', () => {
    const items = buildItems(createMockPackageInfo({ versions: [], latest: '', distTags: {} }))
    expect(items).toHaveLength(0)
  })
})

describe('hoverLinks', () => {
  it('includes an npm link', () => {
    expect(hoverLinks(createMockPackageInfo())).toContain('[npm]')
  })

  it('includes a Homepage link when it differs from the registry URL', () => {
    const links = hoverLinks(createMockPackageInfo({ homepage: 'https://lodash.com' }))
    expect(links).toContain('[Homepage]')
  })

  it('omits the Homepage link when it matches the registry URL', () => {
    const info = createMockPackageInfo({ homepage: 'https://www.npmjs.com/package/lodash' })
    expect(hoverLinks(info)).not.toContain('[Homepage]')
  })
})

describe('packageUrl', () => {
  it('builds the npm package page URL', () => {
    expect(packageUrl('lodash')).toBe('https://www.npmjs.com/package/lodash')
  })
})

describe('shouldSkip', () => {
  it.each([
    'file:../local-pkg',
    'link:../sibling',
    'workspace:^1.0.0',
    'git+https://github.com/user/repo.git',
    'https://example.com/pkg.tgz',
    '*',
    'latest',
  ])('skips non-comparable reference %s', (range) => {
    expect(shouldSkip(createMockDep({ versionRange: range }))).toBe(true)
  })

  it('does not skip a normal semver range', () => {
    expect(shouldSkip(createMockDep({ versionRange: '^4.17.21' }))).toBe(false)
  })
})
