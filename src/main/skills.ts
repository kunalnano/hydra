import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { SkillFeed, SkillUpdate } from '../shared/types'

const DEFAULT_SKILLS_ROOT = join(homedir(), '.codex', 'skills')

function humanizeSkillName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function readSkillTitle(skillPath: string, fallbackName: string): string {
  const skillFile = join(skillPath, 'SKILL.md')
  if (!existsSync(skillFile)) {
    return humanizeSkillName(fallbackName)
  }

  try {
    const content = readFileSync(skillFile, 'utf-8')
    const heading = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('# '))

    return heading ? heading.replace(/^#\s+/, '').trim() : humanizeSkillName(fallbackName)
  } catch {
    return humanizeSkillName(fallbackName)
  }
}

function collectSkillDirectories(
  rootDir: string,
  scope: SkillUpdate['scope']
): SkillUpdate[] {
  if (!existsSync(rootDir)) {
    return []
  }

  const updates: SkillUpdate[] = []

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') && scope !== 'system') continue

    const skillPath = join(rootDir, entry.name)
    const skillFile = join(skillPath, 'SKILL.md')
    if (!existsSync(skillFile)) continue

    let updatedAt = 0
    try {
      updatedAt = statSync(skillFile).mtimeMs
    } catch {
      updatedAt = 0
    }

    updates.push({
      name: entry.name,
      title: readSkillTitle(skillPath, entry.name),
      path: skillPath,
      updatedAt,
      scope
    })
  }

  return updates
}

export function getSkillFeed(limit = 6, skillsRoot = DEFAULT_SKILLS_ROOT): SkillFeed {
  const userSkills = collectSkillDirectories(skillsRoot, 'user')
  const systemSkills = collectSkillDirectories(join(skillsRoot, '.system'), 'system')
  const allSkills = [...userSkills, ...systemSkills].sort((a, b) => b.updatedAt - a.updatedAt)

  return {
    totalSkills: allSkills.length,
    recent: allSkills.slice(0, Math.max(1, limit))
  }
}
