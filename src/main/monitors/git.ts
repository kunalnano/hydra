import { exec } from 'child_process'
import { promisify } from 'util'
import type { GitRepoInfo } from '../../shared/types'

const execAsync = promisify(exec)

const DEFAULT_SCAN_DIRS = ['~/Documents/ai/myAIProjects']

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
  const dirs = (scanDirs || DEFAULT_SCAN_DIRS).map((d) => d.replace(/^~/, process.env.HOME || ''))
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
