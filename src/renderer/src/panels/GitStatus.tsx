import { useSystemStore } from '../stores/system'
import type { GitRepoInfo } from '../../../../shared/types'

const STATUS_STYLES: Record<GitRepoInfo['status'], { color: string; label: string }> = {
  clean: { color: 'text-green-400', label: 'clean' },
  dirty: { color: 'text-amber-400', label: 'dirty' },
  ahead: { color: 'text-blue-400', label: 'ahead' },
  behind: { color: 'text-orange-400', label: 'behind' },
  diverged: { color: 'text-red-400', label: 'diverged' },
  error: { color: 'text-gray-600', label: 'error' }
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

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800/50 transition-colors">
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
  )
}
