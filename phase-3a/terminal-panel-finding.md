# Terminal-Panel Finding

**Question:** Does HELM currently have an in-app terminal renderer (xterm.js, node-pty, or equivalent)?

**Answer:** **No.** Definitive.

## Evidence

### Code-level search

```
$ cd ~/Documents/ai/myAIProjects/hydra
$ rg "xterm|node-pty|pty\.js|@xterm|@wterm" --no-heading
(zero matches)
```

Zero hits across the entire repository for any string matching a terminal-emulator library or PTY shim.

### Dependency check

Filtering `package.json` for terminal/PTY-adjacent packages:

```
$ python3 -c "import json; d=json.load(open('package.json')); \
  deps={**d.get('dependencies',{}), **d.get('devDependencies',{})}; \
  [print(k,v) for k,v in sorted(deps.items()) \
   if any(t in k.lower() for t in ['xterm','pty','term'])]"
(zero matches)
```

No `xterm`, `@xterm/xterm`, `node-pty`, `@wterm/*`, or any package with a terminal/PTY-related name is present.

### Semantic confirmation

The panels that might have been mistaken for a terminal renderer:

- `CommandCenter.tsx` — DOM rows showing process groups, CPU/mem, git, ports, freeze/kill action buttons. Reads from `useSystemStore`. Never emulates a terminal.
- `HiveLauncher.tsx` — DOM form controls (inputs, selects, buttons) for launching external tmux sessions. Invokes `window.helm.*` IPC to `spawn/attach/kill` shell sessions. No rendering of PTY output in-app.
- `Logs.tsx` — DOM-list streaming log lines from monitors. Not a PTY; not interactive.

None of these wrap an xterm.js renderer, parse ANSI escape sequences for terminal display, or own a PTY child process. The closest HELM gets to a terminal is forwarding commands to external tmux (outside HELM's DOM).

## Verdict for Phase 3B

**Phase 3B is net-new, not replacement.** Integration consists of:

1. Add `@wterm/core`, `@wterm/dom`, `@wterm/react`, and `node-pty` as deps.
2. Add a new panel (probably `Terminal.tsx` in `panels/`) that hosts a `<Terminal>` component connected to a PTY server.
3. Decide whether the PTY server lives in HELM's main process (simpler, bundled) or runs as an external service (matches the spike server.mjs architecture and reuses Phase 2 shared-PTY infrastructure without refactor).
4. Wire the new panel into App.tsx — likely a new page (e.g., `terminal` or `shell`) or a sub-panel on an existing page. Natural homes: Bridge (alongside Command Center) or a dedicated new page.

**No existing code to replace.** No legacy terminal to deprecate. No migration plan required for end-users.

This significantly reduces Phase 3B risk: we're adding a fresh component with no coupling to existing HELM features, and the Phase 2 server is ready to serve its WebSocket stream to either HELM's own main process or from the spike repo.

## Implication for the audit

Because there is no terminal panel to audit, Phase 3A's component-observability table does not need a "terminal renderer" row. The audit scope remains all 26 panel files + 9 component files + 4 data files, covering every actual HELM surface.
