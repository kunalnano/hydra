import { useState, useEffect, useCallback } from 'react'
import { useSystemStore } from '../stores/system'
import type { GitCommit } from '../../../../shared/types'

function relativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}

const AGENT_COLORS: Record<string, string> = {
  claude: 'bg-purple-500/20 text-purple-300',
  copilot: 'bg-blue-500/20 text-blue-300',
  cursor: 'bg-emerald-500/20 text-emerald-300',
  aider: 'bg-amber-500/20 text-amber-300',
  gemini: 'bg-cyan-500/20 text-cyan-300'
}

export function GitHistoryPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const fetchCommits = useCallback(async () => {
    if (!state?.gitRepos?.length) return
    try {
      const allCommits: GitCommit[] = []
      for (const repo of state.gitRepos) {
        const repoCommits = await window.hydra.getCommitHistory(repo.path, 20)
        allCommits.push(...repoCommits)
      }
      allCommits.sort((a, b) => b.timestamp - a.timestamp)
      setCommits(allCommits.slice(0, 20))
    } catch {
      /* ignore fetch errors */
    }
  }, [state?.gitRepos])

  useEffect(() => {
    fetchCommits()
    const interval = setInterval(fetchCommits, 30000)
    return () => clearInterval(interval)
  }, [fetchCommits])

  if (!state) return <></>

  if (commits.length === 0) {
    return <div className="text-gray-600 text-sm">No recent commits</div>
  }

  // Group by repo
  const byRepo = new Map<string, GitCommit[]>()
  for (const c of commits) {
    const list = byRepo.get(c.repoName) || []
    list.push(c)
    byRepo.set(c.repoName, list)
  }

  const toggleRepo = (name: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="space-y-2 text-sm overflow-y-auto max-h-full">
      {[...byRepo.entries()].map(([repoName, repoCommits]) => (
        <div key={repoName}>
          <button
            onClick={() => toggleRepo(repoName)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs mb-1 transition-colors"
          >
            <span className={`transition-transform ${collapsed.has(repoName) ? '' : 'rotate-90'}`}>
              ▸
            </span>
            <span className="font-semibold uppercase tracking-wider">{repoName}</span>
            <span className="text-gray-600">({repoCommits.length})</span>
          </button>
          {!collapsed.has(repoName) && (
            <div className="space-y-0.5 ml-3">
              {repoCommits.map((commit) => (
                <CommitRow key={commit.hash} commit={commit} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CommitRow({ commit }: { commit: GitCommit }): JSX.Element {
  const agentStyle = commit.aiAgent
    ? AGENT_COLORS[commit.aiAgent] || 'bg-gray-500/20 text-gray-300'
    : ''

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-800/50 transition-colors">
      <span className="font-mono text-cyan-400 text-xs shrink-0">{commit.shortHash}</span>
      <span className="text-white text-sm truncate flex-1">{commit.message}</span>
      {commit.isAiAuthored && commit.aiAgent && (
        <span className={`text-xs px-1.5 rounded-full shrink-0 ${agentStyle}`}>
          {commit.aiAgent}
        </span>
      )}
      <span className="text-gray-500 text-xs shrink-0">{commit.author}</span>
      <span className="text-gray-600 text-xs shrink-0">{relativeTime(commit.timestamp)}</span>
    </div>
  )
}
