import { useState, useCallback } from 'react'
import { useSystemStore } from '../stores/system'
import type { GitRepoInfo, GitActionResult } from '../../../shared/types'

const STATUS_STYLES: Record<GitRepoInfo['status'], { color: string; label: string; border: string }> = {
  clean: { color: 'text-green-400', label: 'clean', border: 'border-green-800/30' },
  dirty: { color: 'text-amber-300', label: 'dirty', border: 'border-amber-800/40' },
  ahead: { color: 'text-blue-300', label: 'ahead', border: 'border-blue-800/40' },
  behind: { color: 'text-orange-300', label: 'behind', border: 'border-orange-800/40' },
  diverged: { color: 'text-rose-300', label: 'diverged', border: 'border-rose-800/40' },
  error: { color: 'text-gray-500', label: 'error', border: 'border-gray-800/40' }
}

type GitAction = 'pull' | 'push' | 'stash' | 'stash pop' | 'fetch'
type RepoFilter = 'attention' | 'dirty' | 'remote' | 'all'

function actionsForStatus(repo: GitRepoInfo): GitAction[] {
  const actions: GitAction[] = []
  if (repo.status === 'behind') actions.push('fetch', 'pull')
  if (repo.status === 'ahead') actions.push('push', 'fetch')
  if (repo.status === 'diverged') actions.push('fetch', 'pull', 'stash')
  if (repo.status === 'dirty') actions.push('stash')
  if (repo.status === 'clean') actions.push('fetch')
  if (repo.status === 'error') return []

  if (repo.dirty && !actions.includes('stash')) actions.push('stash')
  return actions
}

const ACTION_STYLES: Record<GitAction, { label: string; color: string }> = {
  pull: { label: 'Pull', color: 'text-orange-200 border-orange-700/60 hover:bg-orange-950/40' },
  push: { label: 'Push', color: 'text-blue-200 border-blue-700/60 hover:bg-blue-950/40' },
  stash: { label: 'Stash', color: 'text-amber-200 border-amber-700/60 hover:bg-amber-950/40' },
  'stash pop': {
    label: 'Pop',
    color: 'text-purple-200 border-purple-700/60 hover:bg-purple-950/40'
  },
  fetch: { label: 'Fetch', color: 'text-gray-200 border-gray-700 hover:bg-gray-800/60' }
}

function getActionPriority(repo: GitRepoInfo): number {
  if (repo.status === 'diverged') return 0
  if (repo.dirty) return 1
  if (repo.behind > 0) return 2
  if (repo.ahead > 0) return 3
  if (repo.status === 'error') return 4
  return 5
}

function filterRepo(repo: GitRepoInfo, filter: RepoFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'attention') return repo.dirty || repo.ahead > 0 || repo.behind > 0 || repo.status === 'diverged'
  if (filter === 'dirty') return repo.dirty
  return repo.behind > 0 || repo.ahead > 0 || repo.status === 'diverged'
}

function getRepoAdvice(repo: GitRepoInfo): string {
  if (repo.status === 'diverged') {
    return 'Remote and local both moved. Fetch first, then reconcile before you trust this branch.'
  }
  if (repo.dirty && repo.untracked > 0) {
    return `Working tree is live: ${repo.modified} modified, ${repo.untracked} untracked. Stash it if you need a clean runway.`
  }
  if (repo.dirty) {
    return `Working tree has ${repo.modified} modified file${repo.modified === 1 ? '' : 's'}. Stash or commit when you want this repo quiet.`
  }
  if (repo.behind > 0) {
    return `Remote is ${repo.behind} commit${repo.behind === 1 ? '' : 's'} ahead. Fetch now, pull when you are ready to absorb the blast radius.`
  }
  if (repo.ahead > 0) {
    return `Local branch is ${repo.ahead} commit${repo.ahead === 1 ? '' : 's'} ahead. Push when you want your work to stop living only on this machine.`
  }
  if (repo.status === 'error') {
    return 'Hydra could not read this repo cleanly. This one needs a manual eyeball.'
  }
  return 'No immediate git mess detected. This repo is behaving itself.'
}

function summarizeBulkResult(label: string, results: { repo: string; result: GitActionResult }[]): { ok: boolean; msg: string } {
  const successes = results.filter((entry) => entry.result.success)
  const failures = results.filter((entry) => !entry.result.success)

  if (failures.length === 0) {
    return { ok: true, msg: `${label}: ${successes.length} repo${successes.length === 1 ? '' : 's'} handled.` }
  }

  const firstFailure = failures[0]
  return {
    ok: false,
    msg: `${label}: ${successes.length} ok, ${failures.length} failed. ${firstFailure.repo}: ${firstFailure.result.output}`
  }
}

export function GitStatusPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  const refresh = useSystemStore((s) => s.refresh)
  const [filter, setFilter] = useState<RepoFilter>('attention')
  const [bulkRunning, setBulkRunning] = useState<string | null>(null)
  const [bulkFeedback, setBulkFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  if (!state) return <></>

  if (state.gitRepos.length === 0) {
    return <div className="text-gray-600 text-sm">No repos found</div>
  }

  const dirtyRepos = state.gitRepos.filter((repo) => repo.dirty)
  const aheadRepos = state.gitRepos.filter((repo) => repo.ahead > 0)
  const remoteDriftRepos = state.gitRepos.filter((repo) => repo.behind > 0 || repo.status === 'diverged')
  const attentionRepos = state.gitRepos.filter((repo) => filterRepo(repo, 'attention'))

  const visibleRepos = [...state.gitRepos]
    .filter((repo) => filterRepo(repo, filter))
    .sort((a, b) => {
      const priorityDiff = getActionPriority(a) - getActionPriority(b)
      if (priorityDiff !== 0) return priorityDiff
      return a.name.localeCompare(b.name)
    })

  const runBulkAction = useCallback(
    async (repos: GitRepoInfo[], action: GitAction, label: string) => {
      if (repos.length === 0) return
      setBulkRunning(label)
      setBulkFeedback(null)

      const results: { repo: string; result: GitActionResult }[] = []
      for (const repo of repos) {
        const result = await window.hydra.runGitAction(repo.path, action)
        results.push({ repo: repo.name, result })
      }

      const summary = summarizeBulkResult(label, results)
      setBulkFeedback(summary)
      setBulkRunning(null)
      if (results.some((entry) => entry.result.success)) refresh()
      setTimeout(() => setBulkFeedback(null), 5000)
    },
    [refresh]
  )

  return (
    <div className="space-y-3 text-sm overflow-y-auto max-h-full">
      <div className="rounded-xl border border-gray-800/70 bg-gray-950/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-500">Action Queue</div>
            <div className="pt-1 text-sm text-white">
              {attentionRepos.length > 0
                ? `${attentionRepos.length} repo${attentionRepos.length === 1 ? '' : 's'} need attention`
                : 'No repo drift worth your blood pressure'}
            </div>
            <div className="pt-1 text-xs text-gray-500">
              {dirtyRepos.length} dirty, {aheadRepos.length} ahead, {remoteDriftRepos.length} behind/diverged
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              onClick={() => void runBulkAction(dirtyRepos, 'stash', 'Stash dirty')}
              disabled={dirtyRepos.length === 0 || bulkRunning !== null}
              className="px-2.5 py-1 text-[10px] rounded border border-amber-700/60 text-amber-200 hover:bg-amber-950/40 disabled:opacity-40 transition-colors"
            >
              {bulkRunning === 'Stash dirty' ? 'Stashing...' : 'Stash Dirty'}
            </button>
            <button
              onClick={() => void runBulkAction(remoteDriftRepos, 'fetch', 'Fetch remotes')}
              disabled={remoteDriftRepos.length === 0 || bulkRunning !== null}
              className="px-2.5 py-1 text-[10px] rounded border border-blue-700/60 text-blue-200 hover:bg-blue-950/40 disabled:opacity-40 transition-colors"
            >
              {bulkRunning === 'Fetch remotes' ? 'Fetching...' : 'Fetch Remotes'}
            </button>
          </div>
        </div>

        <div className="pt-3 flex flex-wrap gap-1.5">
          <FilterChip label="Needs Action" active={filter === 'attention'} onClick={() => setFilter('attention')} />
          <FilterChip label="Dirty" active={filter === 'dirty'} onClick={() => setFilter('dirty')} />
          <FilterChip label="Remote Drift" active={filter === 'remote'} onClick={() => setFilter('remote')} />
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        </div>

        {bulkFeedback && (
          <div className={`pt-2 text-[11px] ${bulkFeedback.ok ? 'text-green-400' : 'text-rose-400'}`}>
            {bulkFeedback.msg}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {visibleRepos.map((repo) => (
          <RepoRow key={repo.path} repo={repo} />
        ))}
      </div>

      {visibleRepos.length === 0 && (
        <div className="text-xs text-gray-600 px-1">
          Nothing matches this filter. Hydra finally found a quiet corner.
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'border-cyan-700/60 bg-cyan-950/30 text-cyan-200'
          : 'border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

function RepoRow({ repo }: { repo: GitRepoInfo }): JSX.Element {
  const style = STATUS_STYLES[repo.status]
  const actions = actionsForStatus(repo)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const refresh = useSystemStore((s) => s.refresh)

  const handleAction = useCallback(
    async (action: GitAction) => {
      setRunningAction(action)
      setFeedback(null)
      try {
        const result = await window.hydra.runGitAction(repo.path, action)
        setFeedback({ ok: result.success, msg: result.output })
        if (result.success) refresh()
      } catch {
        setFeedback({ ok: false, msg: 'Action failed' })
      } finally {
        setRunningAction(null)
        setTimeout(() => setFeedback(null), 4000)
      }
    },
    [repo.path, refresh]
  )

  const copyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(repo.path)
      setFeedback({ ok: true, msg: 'Repo path copied' })
    } catch {
      setFeedback({ ok: false, msg: 'Clipboard refused the mission' })
    } finally {
      setTimeout(() => setFeedback(null), 2500)
    }
  }, [repo.path])

  return (
    <div className={`rounded-xl border bg-gray-950/40 p-3 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-sm font-medium truncate">{repo.name}</span>
            <span className="text-gray-500 text-[11px] font-mono truncate">{repo.branch}</span>
            <span className={`text-[10px] uppercase tracking-[0.18em] ${style.color}`}>{style.label}</span>
          </div>
          <div className="pt-1 text-xs text-gray-400">{getRepoAdvice(repo)}</div>
          <div className="pt-1 text-[11px] text-gray-600 font-mono truncate" title={repo.path}>
            {repo.path}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2 text-[11px] font-mono">
          {repo.modified > 0 && <span className="text-amber-300">{repo.modified}M</span>}
          {repo.untracked > 0 && <span className="text-gray-400">{repo.untracked}?</span>}
          {repo.ahead > 0 && <span className="text-blue-300">↑{repo.ahead}</span>}
          {repo.behind > 0 && <span className="text-orange-300">↓{repo.behind}</span>}
        </div>
      </div>

      <div className="pt-2 flex flex-wrap items-center gap-1.5">
        {actions.map((action) => {
          const actionStyle = ACTION_STYLES[action]
          const isRunning = runningAction === action
          return (
            <button
              key={action}
              onClick={() => handleAction(action)}
              disabled={runningAction !== null}
              className={`px-2.5 py-1 text-[10px] font-medium rounded border transition-colors disabled:opacity-40 ${actionStyle.color}`}
            >
              {isRunning ? '...' : actionStyle.label}
            </button>
          )
        })}
        <button
          onClick={() => void copyPath()}
          className="px-2.5 py-1 text-[10px] font-medium rounded border border-gray-700 text-gray-300 hover:bg-gray-800/60 transition-colors"
        >
          Copy Path
        </button>
        {feedback && (
          <span className={`text-[10px] truncate max-w-[300px] ${feedback.ok ? 'text-green-400' : 'text-rose-400'}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  )
}
