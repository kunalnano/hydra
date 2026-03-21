import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

export function ensureHiveDirectories(sharedContextPath: string): void {
  const dir = dirname(sharedContextPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  // Create standard HIVE subdirectories
  for (const sub of ['plans', 'research', 'scripts', 'deliverables']) {
    const subDir = `${dir}/${sub}`
    if (!existsSync(subDir)) {
      mkdirSync(subDir, { recursive: true })
    }
  }
}

export function readSharedContext(path: string): string {
  try {
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

export function writeSharedContext(
  path: string,
  objective: string,
  sections?: Record<string, string>
): void {
  ensureHiveDirectories(path)

  const now = new Date().toISOString()
  let content = `# HIVE Shared Context

> Last updated: ${now}
> Active project: ${objective}

## Current Objective
${objective}

## Active Decisions
${sections?.decisions ?? '<!-- Architect decisions that other agents should know about -->'}

## Blockers
${sections?.blockers ?? '<!-- Builder/Ops blockers that need attention -->'}

## Recent Outputs
${sections?.outputs ?? '<!-- Cross-reference tags from agent outputs -->'}
`
  writeFileSync(path, content, 'utf-8')
}
