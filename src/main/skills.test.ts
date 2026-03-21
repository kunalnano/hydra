import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'
import { getSkillFeed } from './skills'

describe('getSkillFeed', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('reads user and system skills and sorts by latest update', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'helm-skills-'))

    const userSkillDir = join(tempDir, 'playwright')
    const systemRoot = join(tempDir, '.system')
    const systemSkillDir = join(systemRoot, 'openai-docs')

    mkdirSync(userSkillDir, { recursive: true })
    mkdirSync(systemSkillDir, { recursive: true })

    const userSkillFile = join(userSkillDir, 'SKILL.md')
    const systemSkillFile = join(systemSkillDir, 'SKILL.md')

    writeFileSync(userSkillFile, '# Playwright\nBrowser automation skill.\n', 'utf-8')
    writeFileSync(systemSkillFile, '# OpenAI Docs\nOfficial docs skill.\n', 'utf-8')

    utimesSync(userSkillFile, new Date('2026-03-20T12:00:00Z'), new Date('2026-03-20T12:00:00Z'))
    utimesSync(systemSkillFile, new Date('2026-03-21T12:00:00Z'), new Date('2026-03-21T12:00:00Z'))

    const feed = getSkillFeed(5, tempDir)

    expect(feed.totalSkills).toBe(2)
    expect(feed.recent).toHaveLength(2)
    expect(feed.recent[0]).toMatchObject({
      name: 'openai-docs',
      title: 'OpenAI Docs',
      scope: 'system'
    })
    expect(feed.recent[1]).toMatchObject({
      name: 'playwright',
      title: 'Playwright',
      scope: 'user'
    })
  })
})
