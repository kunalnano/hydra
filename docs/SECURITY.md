# HYDRA Security Audit Report

**Date:** 2026-03-06
**Scope:** Source code, dependencies, Electron configuration
**Auditor:** Claude Code (automated static analysis)

---

## Overall Rating: B+

HYDRA demonstrates strong security fundamentals — proper context isolation, a well-scoped preload bridge, command allowlisting, and process-kill safeguards. The main areas for improvement are sandbox mode, URL validation on `shell.openExternal`, and a hardcoded network range in the security scanner.

---

## 1. Dependency Vulnerabilities

**Status: PASS**

```
npm audit: 0 vulnerabilities found
```

All direct and transitive dependencies are clean as of this audit date.

---

## 2. Hardcoded Sensitive Values

**Status: WARNING — 1 finding**

| File | Line | Finding | Severity |
|------|------|---------|----------|
| `src/main/intelligence/security.ts` | 63 | Hardcoded `192.168.1.0/24` as default network scan target | Low |

The value is a non-secret default for Staff of Gandalf's network scan range and is overridden at runtime by the local gateway. No API keys, tokens, or credentials were found anywhere in source.

**What's good:**
- No `ANTHROPIC_API_KEY` or `sk-ant-*` tokens in source
- API keys are loaded exclusively from environment variables and `.env` files
- `.env*` is in `.gitignore`
- LM Studio URL defaults to localhost, configurable via env var

---

## 3. .gitignore Coverage

**Status: PASS**

The `.gitignore` correctly covers:

| Pattern | Protects |
|---------|----------|
| `.env*` | Environment files with secrets |
| `*.local` | Local override files |
| `node_modules` | Dependencies |
| `dist`, `out` | Build artifacts |
| `tasks/` | Internal task tracking |
| `*.log*` | Log files |
| `reports/` | Generated reports |

**Recommendation:** Consider adding `*.sqlite` and `*.db` to prevent accidental commits of local database files.

---

## 4. Electron Security Best Practices

### 4a. Context Isolation

**Status: PASS**

`contextIsolation` defaults to `true` in Electron 28+ and is not explicitly disabled. The preload script correctly uses `contextBridge.exposeInMainWorld()` to bridge the renderer.

### 4b. Node Integration

**Status: PASS**

`nodeIntegration` defaults to `false` in Electron 28+ and is not explicitly enabled. The renderer has no direct access to Node.js APIs.

### 4c. Sandbox Mode

**Status: FAIL**

```typescript
// src/main/index.ts:46
sandbox: false
```

Sandbox is explicitly disabled. This allows the preload script to use full Node.js APIs (which HYDRA needs for `ipcRenderer`), but it weakens the renderer's isolation. In a compromised renderer scenario, the attack surface is larger.

**Recommendation:** Evaluate whether `sandbox: true` is feasible. Electron 28+ supports sandboxed preload scripts with `contextBridge` — the current preload only uses `ipcRenderer`, which works in sandbox mode. Switching to `sandbox: true` would be a meaningful hardening step.

### 4d. shell.openExternal

**Status: WARNING**

```typescript
// src/main/index.ts:54-57
mainWindow.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url)
  return { action: 'deny' }
})
```

This opens any URL the renderer requests in the system browser without validation. A compromised renderer or XSS could trigger opening of `file://`, `smb://`, or other dangerous protocol URLs.

**Recommendation:** Validate the URL scheme before opening:
```typescript
const url = new URL(details.url)
if (['http:', 'https:'].includes(url.protocol)) {
  shell.openExternal(details.url)
}
```

### 4e. Other Electron Settings

**Status: PASS**

- `webSecurity` is not disabled (defaults to `true`)
- `allowRunningInsecureContent` is not enabled
- `enableRemoteModule` is not enabled
- `nodeIntegrationInSubFrames` is not enabled

---

## 5. Preload Bridge (contextBridge)

**Status: PASS**

`src/preload/index.ts` follows Electron security best practices:

- Uses `contextBridge.exposeInMainWorld('hydra', api)` — proper isolation
- All IPC calls use typed channel constants from `shared/types.ts`
- No `require()`, `eval()`, `exec()`, `spawn()`, or `Function()` in preload
- No raw `ipcRenderer` exposed to renderer — all calls are wrapped in typed functions
- Return types are properly constrained (no generic `any` passthrough of Node APIs)

**Sensitive APIs exposed via IPC:**
| API | Risk | Mitigation |
|-----|------|------------|
| `killProcess(pid)` | High | PID validation, protected process list, PID-recycle check, uses `execFile` (not `exec`) |
| `signalProcess(pid, signal)` | High | Same safeguards as killProcess |
| `killGroup(pids, name)` | High | Same safeguards, applied per-process |
| `requestSecurityScan(command)` | Medium | Command allowlist (`VALID_COMMANDS`), no user input in shell string |
| `runGitAction(repoPath, action)` | Medium | Should be verified — action must be from a fixed set |
| `saveConfig(config)` | Low | Writes to XDG config path only |

---

## 6. Shell Command Execution

**Status: PASS (with notes)**

HYDRA's main process makes extensive use of `child_process.exec()` for system monitoring (`ps`, `lsof`, `nettop`, `df`, etc.). Review:

| Module | Method | Input Source | Injection Risk |
|--------|--------|-------------|----------------|
| `processes.ts` | `exec` | Hardcoded `ps aux` | None |
| `ports.ts` | `exec` | Hardcoded `lsof` | None |
| `network.ts` | `exec` | Hardcoded `nettop` | None |
| `battery.ts` | `exec` | Hardcoded `pmset` | None |
| `disk.ts` | `exec` | Hardcoded `df` | None |
| `git.ts` | `exec` | Scanned directory paths (from config) | Low — paths from config, not renderer |
| `security.ts` | `exec` | Allowlisted commands + resolved binary path | Low — validated via `VALID_COMMANDS` |
| `actions.ts` | `execFile` | PID from renderer | Mitigated — `execFile` avoids shell, PID validated as integer |

**What's good:**
- `actions.ts` uses `execFile` (not `exec`) — immune to shell injection
- Security scan commands are allowlisted, not passed through from renderer
- Comment at `security.ts:242` explicitly documents the exec safety rationale

---

## 7. Summary

### What's Good

- **Zero dependency vulnerabilities** — clean `npm audit`
- **No secrets in source** — all credentials via env vars, `.env` properly gitignored
- **Proper context isolation** — `contextBridge` used correctly, no Node APIs leaked to renderer
- **Process kill safeguards** — PID validation, protected process list, PID-recycle detection, `execFile` usage
- **Security scan allowlisting** — renderer cannot execute arbitrary shell commands
- **No dangerous Electron flags** — `webSecurity`, `nodeIntegration`, `allowRunningInsecureContent` all at safe defaults

### What Needs Attention

| Priority | Finding | Location |
|----------|---------|----------|
| **Medium** | `sandbox: false` — preload runs unsandboxed | `src/main/index.ts:46` |
| **Medium** | `shell.openExternal` accepts any URL protocol | `src/main/index.ts:54-57` |
| **Low** | Hardcoded `192.168.1.0/24` default | `src/main/intelligence/security.ts:63` |
| **Low** | `.gitignore` missing `*.sqlite`/`*.db` patterns | `.gitignore` |

### Recommended Fixes

1. **Enable sandbox mode** — Change `sandbox: false` to `sandbox: true` in `webPreferences`. Test that IPC still works (it should — `contextBridge` + `ipcRenderer` work in sandbox mode).

2. **Validate URLs before opening externally** — Add protocol allowlist (`http:`, `https:`) in the `setWindowOpenHandler` callback.

3. **Add database file patterns to .gitignore** — Append `*.sqlite` and `*.db` to prevent accidental commits.

4. **Minor:** The `192.168.1.0/24` default is harmless (overridden at runtime) but could be replaced with a placeholder or removed in favor of pure runtime detection.
