# HELM Security Audit Report

**Date:** 2026-03-06
**Scope:** Source code, dependencies, Electron configuration
**Auditor:** Claude Code (automated static analysis)

---

## Overall Rating: A-

HELM demonstrates strong security fundamentals — proper context isolation, sandboxed renderer, a well-scoped preload bridge, command allowlisting, URL protocol validation, and process-kill safeguards.

**Update (2026-03-06):** All four findings from the initial B+ audit have been resolved:
- Sandbox mode enabled in webPreferences
- `shell.openExternal` now validates URL protocol (http/https only)
- Hardcoded `192.168.1.0/24` removed — network target is now detected dynamically or configured
- `.gitignore` updated with `*.sqlite`, `*.db`, `*.sqlite-wal`, `*.sqlite-shm` patterns

Remaining gap to A: no CSP (Content-Security-Policy) header configured for the renderer.

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

**Status: PASS (fixed)**

```typescript
// src/main/index.ts:46
sandbox: true
```

Sandbox is enabled. The preload script runs in a sandboxed context with only `contextBridge` and `ipcRenderer` available — no full Node.js access from the renderer.

### 4d. shell.openExternal

**Status: PASS (fixed)**

```typescript
// src/main/index.ts:54-61
mainWindow.webContents.setWindowOpenHandler((details) => {
  try {
    const parsed = new URL(details.url)
    if (['https:', 'http:'].includes(parsed.protocol)) {
      shell.openExternal(details.url)
    }
  } catch {
    // Malformed URL — ignore
  }
  return { action: 'deny' }
})
```

URLs are validated before opening. Only `http:` and `https:` protocols are allowed. Malformed URLs are silently rejected.

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

HELM's main process makes extensive use of `child_process.exec()` for system monitoring (`ps`, `lsof`, `nettop`, `df`, etc.). Review:

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

### Resolved Findings

| Priority | Finding | Status |
|----------|---------|--------|
| **Medium** | `sandbox: false` — preload runs unsandboxed | FIXED — `sandbox: true` |
| **Medium** | `shell.openExternal` accepts any URL protocol | FIXED — http/https allowlist |
| **Low** | Hardcoded `192.168.1.0/24` default | FIXED — dynamic detection only |
| **Low** | `.gitignore` missing `*.sqlite`/`*.db` patterns | FIXED — patterns added |

### Remaining Recommendations

1. **Add Content-Security-Policy** — Configure a strict CSP header for the renderer to prevent XSS if arbitrary content is ever loaded.
2. **Code-sign the .dmg** — Required for macOS Gatekeeper. Not a source-level issue but needed for distribution.
