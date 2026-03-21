import { useEffect, useState } from 'react'
import { useHiveStore } from '../stores/hive'
import { useSystemStore } from '../stores/system'
import type { HiveRoleName, HiveModel } from '../../../shared/types'

const BUILT_IN_ROLES: { name: HiveRoleName; displayName: string; model: HiveModel; description: string }[] = [
  { name: 'architect', displayName: 'Architect', model: 'opus', description: 'System design and planning' },
  { name: 'builder', displayName: 'Builder', model: 'sonnet', description: 'Implementation and code' },
  { name: 'analyst', displayName: 'Analyst', model: 'sonnet', description: 'Research and data analysis' },
  { name: 'ops', displayName: 'Ops', model: 'sonnet', description: 'Infrastructure and automation' },
  { name: 'strategist', displayName: 'Strategist', model: 'opus', description: 'Business strategy' }
]

const MODEL_OPTIONS: HiveModel[] = ['opus', 'sonnet', 'haiku']

const ROLE_COLORS: Record<string, string> = {
  architect: 'text-violet-400',
  builder: 'text-emerald-400',
  analyst: 'text-blue-400',
  ops: 'text-orange-400',
  strategist: 'text-rose-400'
}

export function HiveLauncher(): JSX.Element {
  const sessions = useHiveStore((s) => s.sessions)
  const loading = useHiveStore((s) => s.loading)
  const error = useHiveStore((s) => s.error)
  const spawn = useHiveStore((s) => s.spawn)
  const killSession = useHiveStore((s) => s.killSession)
  const attach = useHiveStore((s) => s.attach)
  const refresh = useHiveStore((s) => s.refresh)
  const initialize = useHiveStore((s) => s.initialize)
  const updateContext = useHiveStore((s) => s.updateContext)
  const getContext = useHiveStore((s) => s.getContext)
  const state = useSystemStore((s) => s.state)

  const [selectedRole, setSelectedRole] = useState<HiveRoleName>('architect')
  const [selectedModel, setSelectedModel] = useState<HiveModel>('opus')
  const [workingDir, setWorkingDir] = useState('')
  const [objective, setObjective] = useState('')
  const [contextText, setContextText] = useState('')
  const [contextExpanded, setContextExpanded] = useState(false)
  const [confirmKill, setConfirmKill] = useState<string | null>(null)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    const role = BUILT_IN_ROLES.find((r) => r.name === selectedRole)
    if (role) setSelectedModel(role.model)
  }, [selectedRole])

  // Repo path suggestions
  const repoPaths = state?.gitRepos.map((r) => r.path) ?? []

  async function handleLaunch(): Promise<void> {
    if (!workingDir.trim()) return
    await spawn({
      role: selectedRole,
      model: selectedModel,
      workingDir: workingDir.trim(),
      objective: objective.trim() || undefined
    })
    setObjective('')
  }

  async function handleLoadContext(): Promise<void> {
    const ctx = await getContext()
    setContextText(ctx)
    setContextExpanded(true)
  }

  async function handlePushContext(): Promise<void> {
    if (!contextText.trim()) return
    await updateContext(contextText.trim())
  }

  const activeSessions = sessions.filter((s) => s.status === 'running')
  const selectClass = 'bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/25 appearance-none'
  const inputClass = 'w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25'

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">HIVE</span>
          <span className="text-[10px] text-gray-500">
            {activeSessions.length > 0
              ? `${activeSessions.length} agent${activeSessions.length === 1 ? '' : 's'} running`
              : 'No agents running'}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="text-[10px] text-gray-500 hover:text-gray-300"
        >
          Refresh
        </button>
      </div>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="space-y-1">
          {activeSessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-2 rounded border border-white/8 bg-black/25 px-2 py-1.5"
            >
              <span className={`text-xs font-semibold ${ROLE_COLORS[session.role] ?? 'text-gray-400'}`}>
                {session.role}
              </span>
              <span className="text-[10px] text-gray-500 truncate flex-1" title={session.workingDir}>
                {session.workingDir.split('/').pop()}
              </span>
              <span className="text-[10px] text-gray-600 font-mono">{session.model}</span>
              <button
                type="button"
                onClick={() => attach(session.id)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300"
                title="Attach to tmux session"
              >
                Attach
              </button>
              {confirmKill === session.id ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { killSession(session.id); setConfirmKill(null) }}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmKill(null)}
                    className="text-[10px] text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmKill(session.id)}
                  className="text-[10px] text-red-400/60 hover:text-red-400"
                  title="Kill session"
                >
                  Kill
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Launch controls */}
      <div className="rounded border border-white/8 bg-black/20 p-3 space-y-2">
        <div className="text-[9px] uppercase tracking-[0.16em] text-gray-500 mb-2">Launch Agent</div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className={selectClass}
          >
            {BUILT_IN_ROLES.map((role) => (
              <option key={role.name} value={role.name}>
                {role.displayName}
              </option>
            ))}
            <option value="custom">Custom...</option>
          </select>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as HiveModel)}
            className={selectClass}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <input
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
            placeholder="Working directory..."
            className={inputClass}
            list="hive-repo-paths"
          />
          <datalist id="hive-repo-paths">
            {repoPaths.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Objective (optional)..."
          className={inputClass}
        />

        <button
          type="button"
          onClick={handleLaunch}
          disabled={loading || !workingDir.trim()}
          className={`w-full py-1.5 rounded text-xs font-semibold transition-colors ${
            loading || !workingDir.trim()
              ? 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
              : 'bg-amber-950/40 border border-amber-700/40 text-amber-400 hover:bg-amber-950/60'
          }`}
        >
          {loading ? 'Launching...' : 'Launch'}
        </button>

        {error && (
          <div className="text-[10px] text-red-400">{error}</div>
        )}
      </div>

      {/* Shared context */}
      <div className="rounded border border-white/8 bg-black/20 p-2">
        <button
          type="button"
          onClick={contextExpanded ? () => setContextExpanded(false) : handleLoadContext}
          className="w-full flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-gray-500"
        >
          <span>Shared Context</span>
          <span>{contextExpanded ? '\u25B2' : '\u25BC'}</span>
        </button>

        {contextExpanded && (
          <div className="mt-2 space-y-2">
            <textarea
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              rows={6}
              className="w-full bg-black/30 border border-white/8 rounded p-2 text-xs text-gray-300 font-mono resize-none focus:outline-none focus:border-white/20"
              placeholder="# HIVE Shared Context..."
            />
            <button
              type="button"
              onClick={handlePushContext}
              className="px-3 py-1 rounded text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
            >
              Push Context
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
