import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import type { GitRepoInfo, GitCommit, GitActionResult } from '../../shared/types'
import { getAppRoot, loadEnvironment, resolvePathSetting } from '../app-paths'

const execAsync = promisify(exec)

function getDefaultScanDirs(): string[] {
  const repoRoot = getAppRoot()
  return existsSync(join(repoRoot, '.git')) ? [repoRoot] : []
}

export function resolveGitScanDirs(scanDirs?: string[]): string[] {
  loadEnvironment()
  const dirs = scanDirs && scanDirs.length > 0 ? scanDirs : getDefaultScanDirs()
  return dirs.map((dir) => resolvePathSetting(dir)).filter((dir) => dir.length > 0)
}

export function parseGitStatus(
  porcelainOutput: string
): Pick<GitRepoInfo, 'dirty' | 'untracked' | 'modified'> {
  const lines = porcelainOutput
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
  let untracked = 0
  let modified = 0

  for (const line of lines) {
    if (line.startsWith('??')) {
      untracked++
    } else {
      modified++
    }
  }

  return { dirty: lines.length > 0, untracked, modified }
}

export function parseGitAheadBehind(statusBranchOutput: string): { ahead: number; behind: number } {
  const aheadMatch = statusBranchOutput.match(/ahead (\d+)/)
  const behindMatch = statusBranchOutput.match(/behind (\d+)/)
  return {
    ahead: aheadMatch ? parseInt(aheadMatch[1], 10) : 0,
    behind: behindMatch ? parseInt(behindMatch[1], 10) : 0
  }
}

function resolveStatus(dirty: boolean, ahead: number, behind: number): GitRepoInfo['status'] {
  if (ahead > 0 && behind > 0) return 'diverged'
  if (ahead > 0) return 'ahead'
  if (behind > 0) return 'behind'
  if (dirty) return 'dirty'
  return 'clean'
}

async function getRepoInfo(repoPath: string): Promise<GitRepoInfo | null> {
  try {
    const opts = { cwd: repoPath }
    const [branchResult, statusResult, aheadBehindResult] = await Promise.all([
      execAsync('git rev-parse --abbrev-ref HEAD', opts),
      execAsync('git status --porcelain', opts),
      execAsync('git status --branch --porcelain', opts)
    ])

    const branch = branchResult.stdout.trim()
    const { dirty, untracked, modified } = parseGitStatus(statusResult.stdout)
    const branchLine = aheadBehindResult.stdout.split('\n')[0]
    const { ahead, behind } = parseGitAheadBehind(branchLine)

    return {
      path: repoPath,
      name: repoPath.split('/').pop() || repoPath,
      branch,
      dirty,
      untracked,
      modified,
      ahead,
      behind,
      status: resolveStatus(dirty, ahead, behind)
    }
  } catch {
    return null
  }
}

export async function scanForRepos(scanDirs?: string[]): Promise<GitRepoInfo[]> {
  const dirs = resolveGitScanDirs(scanDirs)
  const repos: GitRepoInfo[] = []

  for (const dir of dirs) {
    try {
      const { stdout } = await execAsync(`find "${dir}" -maxdepth 2 -name .git -type d 2>/dev/null`)
      const repoPaths = stdout
        .trim()
        .split('\n')
        .filter((p) => p.length > 0)
        .map((p) => p.replace(/\/.git$/, ''))
      const results = await Promise.all(repoPaths.map(getRepoInfo))
      repos.push(...results.filter((r): r is GitRepoInfo => r !== null))
    } catch {
      /* skip inaccessible directories */
    }
  }

  return repos
}

const AI_EMAIL_MAP: Record<string, string> = {
  'noreply@anthropic.com': 'claude',
  'copilot@github.com': 'copilot',
  'noreply@cursor.sh': 'cursor',
  'aider@aider.chat': 'aider'
}

const AI_COAUTHOR_PATTERNS: { pattern: RegExp; agent: string }[] = [
  { pattern: /claude/i, agent: 'claude' },
  { pattern: /copilot/i, agent: 'copilot' },
  { pattern: /cursor/i, agent: 'cursor' },
  { pattern: /aider/i, agent: 'aider' },
  { pattern: /gemini/i, agent: 'gemini' }
]

function detectAiAgent(
  body: string,
  authorEmail: string
): { isAiAuthored: boolean; aiAgent?: string } {
  // Check author email first
  const emailAgent = AI_EMAIL_MAP[authorEmail.toLowerCase()]
  if (emailAgent) {
    return { isAiAuthored: true, aiAgent: emailAgent }
  }

  // Check Co-Authored-By lines in body
  const coAuthorRegex = /co-authored-by:\s*(.+)/gi
  let match: RegExpExecArray | null
  while ((match = coAuthorRegex.exec(body)) !== null) {
    const coAuthorLine = match[1]
    for (const { pattern, agent } of AI_COAUTHOR_PATTERNS) {
      if (pattern.test(coAuthorLine)) {
        return { isAiAuthored: true, aiAgent: agent }
      }
    }
  }

  return { isAiAuthored: false }
}

export function parseGitLog(logOutput: string, repoName: string): GitCommit[] {
  if (!logOutput.trim()) return []

  const records = logOutput.split('§§§').filter((r) => r.trim().length > 0)
  const commits: GitCommit[] = []

  for (const record of records) {
    const lines = record.trim().split('\n')
    if (lines.length === 0) continue

    // First line has the pipe-delimited fields
    const firstLine = lines[0]
    const parts = firstLine.split('|')
    if (parts.length < 5) continue

    const hash = parts[0]
    const author = parts[1]
    const email = parts[2]
    const timestamp = parseInt(parts[3], 10)
    const message = parts[4]
    // Body is everything from parts[5] onwards (message might contain pipes) + remaining lines
    const bodyParts = parts.slice(5)
    const bodyFirstLine = bodyParts.join('|')
    const bodyLines = [bodyFirstLine, ...lines.slice(1)].join('\n')

    if (!hash || isNaN(timestamp)) continue

    const { isAiAuthored, aiAgent } = detectAiAgent(bodyLines, email)

    commits.push({
      hash,
      shortHash: hash.substring(0, 7),
      author,
      email,
      timestamp,
      message,
      isAiAuthored,
      aiAgent,
      repoName
    })
  }

  return commits
}

export async function getRepoCommitHistory(
  repoPath: string,
  limit: number = 20
): Promise<GitCommit[]> {
  try {
    const repoName = repoPath.split('/').pop() || repoPath
    // limit is always a number from the app, repoPath comes from internal repo scanning
    const { stdout } = await execAsync(
      `git log --pretty=format:'%H|%an|%ae|%at|%s|%b§§§' -n ${limit}`,
      { cwd: repoPath, maxBuffer: 1024 * 1024 }
    )
    return parseGitLog(stdout, repoName)
  } catch {
    return []
  }
}

const SAFE_GIT_ACTIONS = ['pull', 'push', 'stash', 'stash pop', 'fetch'] as const

/**
 * Execute a safe git action on a repo.
 * Only whitelisted commands are allowed — no arbitrary shell execution.
 */
export async function runGitAction(repoPath: string, action: string): Promise<GitActionResult> {
  if (!SAFE_GIT_ACTIONS.includes(action as (typeof SAFE_GIT_ACTIONS)[number])) {
    return { success: false, output: `Unknown action: ${action}` }
  }
  try {
    const { stdout, stderr } = await execAsync(`git ${action}`, {
      cwd: repoPath,
      timeout: 30000
    })
    return { success: true, output: stdout.trim() || stderr.trim() || 'Done' }
  } catch (err) {
    const message =
      err instanceof Error
        ? (err as Error & { stderr?: string }).stderr?.trim() || err.message
        : 'Git action failed'
    return { success: false, output: message }
  }
}
