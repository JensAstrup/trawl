import { parseRequirements } from '../parser'


describe('parseRequirements', () => {
  it('parses a simple pinned requirement with positions', () => {
    const deps = parseRequirements('requests==2.31.0')
    expect(deps).toHaveLength(1)
    const dep = deps[0]
    expect(dep.name).toBe('requests')
    expect(dep.versionRange).toBe('==2.31.0')
    expect(dep.line).toBe(0)
    expect(dep.nameStartChar).toBe(0)
    expect(dep.nameEndChar).toBe('requests'.length)
    expect(dep.versionStartChar).toBe('requests'.length)
    expect(dep.versionEndChar).toBe('requests==2.31.0'.length)
  })

  it('parses each operator', () => {
    const deps = parseRequirements(
      ['a==1.0', 'b>=1.0', 'c<=1.0', 'd~=1.0', 'e!=1.0', 'f>1.0', 'g<1.0', 'h===1.0'].join('\n')
    )
    expect(deps.map((dependency) => dependency.versionRange)).toEqual([
      '==1.0', '>=1.0', '<=1.0', '~=1.0', '!=1.0', '>1.0', '<1.0', '===1.0',
    ])
  })

  it('parses compound (comma-joined) specifiers', () => {
    const deps = parseRequirements('django>=4.0,<5.0')
    expect(deps).toHaveLength(1)
    expect(deps[0].versionRange).toBe('>=4.0,<5.0')
  })

  it('strips extras from the package name', () => {
    const deps = parseRequirements('requests[security]==2.31.0')
    expect(deps).toHaveLength(1)
    expect(deps[0].name).toBe('requests')
    expect(deps[0].versionRange).toBe('==2.31.0')
  })

  it('drops environment markers', () => {
    const deps = parseRequirements('requests==2.31.0 ; python_version < "3.8"')
    expect(deps).toHaveLength(1)
    expect(deps[0].versionRange).toBe('==2.31.0')
  })

  it('strips inline comments but keeps the specifier', () => {
    const deps = parseRequirements('flask==2.0.0  # web framework')
    expect(deps).toHaveLength(1)
    expect(deps[0].name).toBe('flask')
    expect(deps[0].versionRange).toBe('==2.0.0')
  })

  it('skips blank lines, full-line comments and directives', () => {
    const text = [
      '',
      '# a comment',
      '-r other-requirements.txt',
      '-e .',
      '--hash=sha256:abc',
      'requests==2.31.0',
    ].join('\n')
    const deps = parseRequirements(text)
    expect(deps.map((dependency) => dependency.name)).toEqual(['requests'])
  })

  it('skips URL, VCS and PEP 508 direct references', () => {
    const text = [
      'git+https://github.com/foo/bar.git',
      'https://example.com/pkg-1.0.tar.gz',
      'pkg @ https://example.com/pkg-1.0.whl',
    ].join('\n')
    expect(parseRequirements(text)).toHaveLength(0)
  })

  it('skips unpinned (name-only) requirements', () => {
    expect(parseRequirements('requests')).toHaveLength(0)
  })

  it('reports the correct line numbers across a file', () => {
    const deps = parseRequirements(['# header', 'requests==2.0.0', '', 'flask>=1.0'].join('\n'))
    expect(deps.map((dependency) => [dependency.name, dependency.line])).toEqual([
      ['requests', 1],
      ['flask', 3],
    ])
  })
})
