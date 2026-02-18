import { useState, useEffect, useRef, useCallback } from 'react'
import { useSystemStore } from '../stores/system'

interface PaletteCommand {
  id: string
  label: string
  aliases: string[]
  description: string
  action: () => Promise<void> | void
}

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

  const commands: PaletteCommand[] = []

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
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[20vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[560px] max-h-[400px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... (kill port 3000, freeze next-app, ...)"
            className="w-full bg-transparent text-white text-sm outline-none placeholder-gray-600"
            autoFocus
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-gray-600 text-sm">No matching commands</div>
          )}
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                idx === selectedIndex
                  ? 'bg-cyan-950/40 border-l-2 border-cyan-400'
                  : 'hover:bg-gray-800/50 border-l-2 border-transparent'
              }`}
              onClick={() => executeCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div>
                <div className="text-sm text-white">{cmd.label}</div>
                <div className="text-xs text-gray-500">{cmd.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600">
          <span>
            <kbd className="px-1 py-0.5 bg-gray-800 rounded">up/dn</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-gray-800 rounded">Enter</kbd> execute
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-gray-800 rounded">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
