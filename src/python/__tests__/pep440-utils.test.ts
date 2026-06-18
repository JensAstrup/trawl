import { PackageInfo } from '../../core/types'
import { analyzeVersion, suggestVersionUpdate } from '../pep440-utils'


function pkg(overrides: Partial<PackageInfo>): PackageInfo {
  return {
    name: 'pkg',
    versions: [],
    latest: '',
    time: {},
    registryUrl: 'https://pypi.org/project/pkg/',
    ...overrides,
  }
}

describe('analyzeVersion (PEP 440)', () => {
  const versions = ['1.0.0', '1.1.0', '1.1.5', '2.0.0', '2.1.0']

  it('classifies a major update', () => {
    const result = analyzeVersion('==1.1.0', pkg({ versions, latest: '2.1.0' }))
    expect(result.updateType).toBe('major')
    expect(result.isUpToDate).toBe(false)
  })

  it('classifies a minor update', () => {
    const result = analyzeVersion('==1.0.0', pkg({ versions, latest: '1.1.0' }))
    expect(result.updateType).toBe('minor')
  })

  it('classifies a patch update', () => {
    const result = analyzeVersion('==1.1.0', pkg({ versions, latest: '1.1.5' }))
    expect(result.updateType).toBe('patch')
  })

  it('reports up to date when already at latest', () => {
    const result = analyzeVersion('==2.1.0', pkg({ versions, latest: '2.1.0' }))
    expect(result.updateType).toBe('none')
    expect(result.isUpToDate).toBe(true)
  })

  it('classifies a prerelease latest', () => {
    const result = analyzeVersion('==1.0.0', pkg({ versions: [...versions, '2.2.0rc1'], latest: '2.2.0rc1' }))
    expect(result.updateType).toBe('prerelease')
  })

  it('honors compatible-release (~=) ranges for max satisfying', () => {
    const result = analyzeVersion('~=1.1.0', pkg({ versions, latest: '2.1.0' }))
    expect(result.maxSatisfying).toBe('1.1.5')
    expect(result.updateType).toBe('major')
  })
})

describe('suggestVersionUpdate (PEP 440)', () => {
  it('preserves the operator', () => {
    expect(suggestVersionUpdate('==2.0.0', '2.31.0')).toBe('==2.31.0')
    expect(suggestVersionUpdate('>=1.0', '2.0.0')).toBe('>=2.0.0')
    expect(suggestVersionUpdate('~=1.4.2', '1.5.0')).toBe('~=1.5.0')
  })

  it('defaults to an exact pin when no operator is present', () => {
    expect(suggestVersionUpdate('1.0.0', '2.0.0')).toBe('==2.0.0')
  })

  it('collapses compound specifiers to an exact pin', () => {
    expect(suggestVersionUpdate('>=4.0,<5.0', '5.2.0')).toBe('==5.2.0')
  })

  it('pins exactly for exclusion and upper-bound operators', () => {
    expect(suggestVersionUpdate('!=1.0.0', '2.0.0')).toBe('==2.0.0')
    expect(suggestVersionUpdate('<2.0.0', '2.0.0')).toBe('==2.0.0')
    expect(suggestVersionUpdate('<=2.0.0', '2.0.0')).toBe('==2.0.0')
    expect(suggestVersionUpdate('>1.0.0', '2.0.0')).toBe('==2.0.0')
  })
})
