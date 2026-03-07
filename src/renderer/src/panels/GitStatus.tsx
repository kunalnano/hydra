import { useState, useCallback } from 'react'
import { useSystemStore } from '../stores/system'
import type { GitRepoInfo } from '../../../shared/types'

const STATUS_STYLES: Record<GitRepoInfo['status'], { color: string; label: string }> = {
  clean: { color: 'text-green-400', label: 'clean' },
  dirty: { color: 'text-amber-400', label: 'dirty' },
  ahead: { color: 'text-blue-400', label: 'ahead' },
  behind: { color: 'text-orange-400', label: 'behind' },
  diverged: { color: 'text-red-400', label: 'diverged' },
  error: { color: 'text-gray-600', label: 'error' }
}

type GitAction = 'pull' | 'push' | 'stash' | 'stash pop' | 'fetch'

/** Which actions make sense for each repo status */
function actionsForStatus(repo: GitRepoInfo): GitAction[] {
  switch (repo.status) {
    case 'behind':
      return ['pull']
    case 'ahead':
      return ['push']
    case 'diverged':
      return ['fetch', 'pull', 'stash']
    case 'dirty':
      return ['stash']
    case 'clean':
      return ['fetch']
    default:
      return []
  }
}

const ACTION_STYLES: Record<GitAction, { label: string; color: string }> = {
  pull: { label: '↓ Pull', color: 'text-orange-300 border-orange-700 hover:bg-orange-900/40' },
  push: { label: '↑ Push', color: 'text-blue-300 border-blue-700 hover:bg-blue-900/40' },
  stash: { label: '⊡ Stash', color: 'text-amber-300 border-amber-700 hover:bg-amber-900/40' },
  'stash pop': {
    label: '⊞ Pop',
    color: 'text-purple-300 border-purple-700 hover:bg-purple-900/40'
  },
  fetch: { label: '⟳ Fetch', color: 'text-gray-300 border-gray-600 hover:bg-gray-800' }
}

export function GitStatusPanel(): JSX.Element {
  const state = useSystemStore((s) => s.state)
  if (!state) return <></>

  if (state.gitRepos.length === 0) {
    return <div className="text-gray-600 text-sm">No repos found</div>
  }

  return (
    <div className="space-y-1 text-sm overflow-y-auto max-h-full">
      {state.gitRepos.map((repo) => (
        <RepoRow key={repo.path} repo={repo} />
      ))}
    </div>
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

  return (
    <div className="py-1.5 px-2 rounded hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white truncate">{repo.name}</span>
          <span className="text-gray-500 text-xs font-mono">{repo.branch}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {repo.modified > 0 && <span className="text-amber-400 text-xs">{repo.modified}M</span>}
          {repo.untracked > 0 && <span className="text-gray-500 text-xs">{repo.untracked}?</span>}
          {repo.ahead > 0 && <span className="text-blue-400 text-xs">↑{repo.ahead}</span>}
          {repo.behind > 0 && <span className="text-orange-400 text-xs">↓{repo.behind}</span>}
          <span className={`text-xs ${style.color}`}>{style.label}</span>
        </div>
      </div>
      {/* Action buttons */}
      {actions.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          {actions.map((action) => {
            const s = ACTION_STYLES[action]
            const isRunning = runningAction === action
            return (
              <button
                key={action}
                onClick={() => handleAction(action)}
                disabled={runningAction !== null}
                className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors disabled:opacity-40 ${s.color}`}
              >
                {isRunning ? '...' : s.label}
              </button>
            )
          })}
          {feedback && (
            <span
              className={`text-[10px] truncate max-w-[200px] ${feedback.ok ? 'text-green-400' : 'text-red-400'}`}
            >
              {feedback.msg}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
