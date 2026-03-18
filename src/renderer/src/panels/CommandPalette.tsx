import { useState, useEffect, useRef, useCallback } from 'react'
import { useSystemStore } from '../stores/system'
import { useNavigationStore, type HydraPageId } from '../stores/navigation'

interface PaletteCommand {
  id: string
  label: string
  aliases: string[]
  description: string
  action: () => Promise<unknown> | void
}

const PAGE_COMMANDS: {
  page: HydraPageId
  label: string
  aliases: string[]
  description: string
}[] = [
  {
    page: 'overview',
    label: 'Open Overview',
    aliases: ['overview', 'home', 'mission control'],
    description: 'Jump to the top-level system posture page'
  },
  {
    page: 'workspaces',
    label: 'Open Workspaces',
    aliases: ['repos', 'git', 'workspace'],
    description: 'Jump to repo drift and process orchestration'
  },
  {
    page: 'agents',
    label: 'Open Agents',
    aliases: ['swarm', 'agent roster'],
    description: 'Jump to agent load and coordination context'
  },
  {
    page: 'systems',
    label: 'Open Systems',
    aliases: ['network', 'ports', 'security'],
    description: 'Jump to network, ports, and machine posture'
  },
  {
    page: 'ai',
    label: 'Open AI',
    aliases: ['lm studio', 'briefing', 'yennefer'],
    description: 'Jump to the operator-facing AI loop'
  },
  {
    page: 'radio',
    label: 'Open FM Radio',
    aliases: ['radio', 'fm', 'stereo', 'stream'],
    description: 'Jump to the built-in FM streaming tuner'
  },
  {
    page: 'activity',
    label: 'Open Activity',
    aliases: ['logs', 'history', 'timeline'],
    description: 'Jump to logs, history, and movement across the machine'
  }
]

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

export function CommandPalette({
  isOpen,
  onClose
}: {
  isOpen: boolean
  onClose: () => void
}): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const state = useSystemStore((s) => s.state)
  const killProcess = useSystemStore((s) => s.killProcess)
  const signalProcess = useSystemStore((s) => s.signalProcess)
  const setCurrentPage = useNavigationStore((s) => s.setCurrentPage)

  const commands: PaletteCommand[] = PAGE_COMMANDS.map((pageCommand) => ({
    id: `open-${pageCommand.page}`,
    label: pageCommand.label,
    aliases: pageCommand.aliases,
    description: pageCommand.description,
    action: () => {
      setCurrentPage(pageCommand.page)
    }
  }))

  if (state) {
    const listeningPorts = state.ports.filter((p) => p.state === 'LISTEN')
    for (const port of listeningPorts) {
      commands.push({
        id: `kill-port-${port.port}`,
        label: `Kill port ${port.port}`,
        aliases: [`kill :${port.port}`, `stop ${port.port}`, port.process],
        description: `Kill ${port.process} (PID ${port.pid}) listening on :${port.port}`,
        action: () => killProcess(port.pid, port.process)
      })
    }

    const workspaces = state.processes.filter((g) => g.type !== 'other')
    for (const ws of workspaces) {
      commands.push({
        id: `freeze-${ws.name}`,
        label: `Freeze ${ws.name}`,
        aliases: [`pause ${ws.name}`, `stop ${ws.name}`, `suspend ${ws.name}`],
        description: `SIGSTOP all ${ws.processes.length} processes in ${ws.name}`,
        action: async () => {
          for (const p of ws.processes) {
            await signalProcess(p.pid, 'SIGSTOP')
          }
        }
      })
      commands.push({
        id: `thaw-${ws.name}`,
        label: `Thaw ${ws.name}`,
        aliases: [`resume ${ws.name}`, `unfreeze ${ws.name}`, `continue ${ws.name}`],
        description: `SIGCONT all ${ws.processes.length} processes in ${ws.name}`,
        action: async () => {
          for (const p of ws.processes) {
            await signalProcess(p.pid, 'SIGCONT')
          }
        }
      })
    }

    commands.push({
      id: 'top-cpu',
      label: "What's using the most CPU?",
      aliases: ['cpu', 'top', 'hot', 'slow', 'heavy'],
      description: 'Show workspace sorted by CPU usage (top consumer first)',
      action: () => {
        onClose()
      }
    })

    commands.push({
      id: 'refresh',
      label: 'Refresh all monitors',
      aliases: ['reload', 'update', 'sync'],
      description: 'Force an immediate refresh of all system monitors',
      action: () => {
        useSystemStore.getState().refresh()
      }
    })
  }

  const filtered =
    query.length === 0
      ? commands
      : commands.filter(
          (cmd) => fuzzyMatch(query, cmd.label) || cmd.aliases.some((a) => fuzzyMatch(query, a))
        )

  const executeCommand = useCallback(
    async (cmd: PaletteCommand) => {
      onClose()
      setQuery('')
      await cmd.action()
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      executeCommand(filtered[selectedIndex])
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="shell-command-overlay fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="shell-command-panel w-[560px] max-h-[420px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shell-command-input-wrap px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... (kill port 3000, freeze next-app, ...)"
            className="shell-command-input"
            autoFocus
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-sm shell-subtle">No matching commands</div>
          )}
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`shell-command-item ${idx === selectedIndex ? 'shell-command-item--active' : ''}`}
              onClick={() => executeCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div>
                <div className="text-sm text-white">{cmd.label}</div>
                <div className="text-xs shell-muted">{cmd.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="shell-command-footer px-4 py-2 flex items-center gap-4 text-[10px] shell-subtle">
          <span>
            <kbd className="shell-command-key">up/dn</kbd> navigate
          </span>
          <span>
            <kbd className="shell-command-key">Enter</kbd> execute
          </span>
          <span>
            <kbd className="shell-command-key">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
