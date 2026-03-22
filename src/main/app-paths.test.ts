import { existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { getAppRoot, resolveMainAssetPath, resolvePathSetting, resolveRepoPath } from './app-paths'

describe('app-paths', () => {
  it('resolves the repo root from the current checkout', () => {
    expect(getAppRoot()).toBe(process.cwd())
  })

  it('resolves repo-relative settings against the app root', () => {
    expect(resolvePathSetting('./docs')).toBe(join(process.cwd(), 'docs'))
  })

  it('finds bundled runtime assets from source locations', () => {
    expect(existsSync(resolveMainAssetPath('data', 'agent-registry.json'))).toBe(true)
    expect(existsSync(resolveMainAssetPath('sentinel', 'config.json'))).toBe(true)
    expect(existsSync(resolveMainAssetPath('hive', 'roles', 'architect.md'))).toBe(true)
  })

  it('resolves repo files from the app root', () => {
    expect(resolveRepoPath('.env.example')).toBe(join(process.cwd(), '.env.example'))
  })
})
