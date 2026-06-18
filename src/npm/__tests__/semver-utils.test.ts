import { PackageInfo } from '../../core/types'
import { analyzeVersion, suggestVersionUpdate } from '../semver-utils'


function pkg(overrides: Partial<PackageInfo>): PackageInfo {
  return {
    name: 'pkg',
    versions: [],
    latest: '',
    distTags: {},
    time: {},
    registryUrl: 'https://www.npmjs.com/package/pkg',
    ...overrides,
  }
}

describe('analyzeVersion (semver)', () => {
  const versions = ['1.0.0', '1.1.0', '1.1.5', '2.0.0', '2.1.0']

  it('classifies a major update', () => {
    const result = analyzeVersion('^1.1.0', pkg({ versions, latest: '2.1.0' }))
    expect(result.updateType).toBe('major')
    expect(result.isUpToDate).toBe(false)
  })

  it('classifies a minor update', () => {
    const result = analyzeVersion('~1.0.0', pkg({ versions, latest: '1.1.0' }))
    expect(result.updateType).toBe('minor')
  })

  it('reports up to date when the range already covers latest', () => {
    const result = analyzeVersion('^2.0.0', pkg({ versions, latest: '2.1.0' }))
    expect(result.isUpToDate).toBe(true)
    expect(result.updateType).toBe('none')
  })
})

describe('suggestVersionUpdate (semver)', () => {
  it('preserves the caret/tilde prefix', () => {
    expect(suggestVersionUpdate('^2.0.0', '3.1.0')).toBe('^3.1.0')
    expect(suggestVersionUpdate('~2.0.0', '2.4.0')).toBe('~2.4.0')
  })

  it('falls back to caret for complex ranges', () => {
    expect(suggestVersionUpdate('1.0.0 || 2.0.0', '3.0.0')).toBe('^3.0.0')
  })
})
