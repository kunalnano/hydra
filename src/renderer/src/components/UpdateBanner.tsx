import { useEffect, useMemo, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'

const DISMISS_KEY_PREFIX = 'helm:update-banner:dismissed:'

function formatPublishedDate(rawValue?: string): string | null {
  if (!rawValue) return null

  const parsed = new Date(rawValue)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function UpdateBanner({ status }: { status: UpdateStatus | null }): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)

  const dismissKey = useMemo(() => {
    if (!status || status.kind !== 'available' || !status.latestVersion) return null
    return `${DISMISS_KEY_PREFIX}${status.latestVersion}`
  }, [status])

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false)
      return
    }

    setDismissed(window.localStorage.getItem(dismissKey) === '1')
  }, [dismissKey])

  if (!status || status.kind !== 'available' || dismissed || !status.latestVersion) {
    return null
  }

  const publishedLabel = formatPublishedDate(status.publishedAt)

  const dismiss = (): void => {
    if (dismissKey) {
      window.localStorage.setItem(dismissKey, '1')
    }
    setDismissed(true)
  }

  return (
    <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/30 px-4 py-3 text-xs text-cyan-100 shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <div className="font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Update Available
          </div>
          <div className="text-sm text-white">
            HELM v{status.latestVersion} is available. You are on v{status.currentVersion}.
          </div>
          <div className="text-[11px] text-cyan-100/80">
            {status.releaseName || `Release v${status.latestVersion}`}
            {publishedLabel ? ` • published ${publishedLabel}` : ''}
          </div>
          <div className="text-[11px] text-cyan-100/75">
            If this clone is stale, pull latest from the repo root. If setup breaks, use the LLM onboarding guide or hand `CLAUDE.md` to your coding agent for a config-only repair path.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status.releaseUrl && (
            <a
              href={status.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-cyan-500/40 bg-cyan-900/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-800/45"
            >
              Release Notes
            </a>
          )}
          {status.changelogUrl && (
            <a
              href={status.changelogUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 transition-colors hover:bg-white/10"
            >
              Changelog
            </a>
          )}
          <button
            onClick={dismiss}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65 transition-colors hover:border-white/20 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
