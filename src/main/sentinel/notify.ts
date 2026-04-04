import { Notification } from 'electron'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { SentinelAlert } from '../../shared/types'

export interface NotifyChannel {
  id: string
  name: string
  enabled: boolean
  send: (alert: SentinelAlert) => void
}

// Channel: macOS native notifications
function sendMacOSNotification(alert: SentinelAlert): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: `HELM Sentinel: ${alert.title}`,
    body: alert.body,
    urgency: alert.severity === 'critical' ? 'critical' : 'normal'
  })
  n.show()
}

// Channel: Obsidian vault log
function sendVaultLog(alert: SentinelAlert, vaultPath?: string): void {
  const base = vaultPath ?? join(homedir(), 'Documents', 'ai', 'obsidian-vault')
  const vaultDir = join(base, 'sentinel')
  if (!existsSync(vaultDir)) {
    mkdirSync(vaultDir, { recursive: true })
  }

  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const timeStr = now.toLocaleTimeString()
  const logFile = join(vaultDir, `${dateStr}.md`)

  const severityIcon =
    alert.severity === 'critical' ? '\u{1F534}' : alert.severity === 'warning' ? '\u{1F7E1}' : '\u{1F535}'

  const entry = `\n## ${severityIcon} ${alert.title} (${timeStr})\n\n${alert.body}\n${alert.suggestedAction ? `\n> ${alert.suggestedAction}\n` : ''}\n---\n`

  // Create file with header if it doesn't exist
  if (!existsSync(logFile)) {
    appendFileSync(logFile, `# Sentinel Alerts - ${dateStr}\n`, 'utf-8')
  }
  appendFileSync(logFile, entry, 'utf-8')
}

// Channel: Slack webhook (stub - configurable)
function sendSlackWebhook(alert: SentinelAlert, webhookUrl: string): void {
  const payload = {
    text: `*HELM Sentinel [${alert.severity.toUpperCase()}]*: ${alert.title}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.title}*\n${alert.body}${alert.suggestedAction ? `\n_${alert.suggestedAction}_` : ''}`
        }
      }
    ]
  }

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch((err) => console.error('[sentinel:slack] Failed to send webhook:', err))
}

// Future channel stubs
export interface NotifyChannelConfig {
  macos_notification: boolean
  slack_webhook: string | null
  vault_log: boolean
  vault_path?: string
  // Future:
  // twilio_sms: { to: string; from: string; authToken: string } | null
  // gmail: { to: string; from: string; appPassword: string } | null
}

export function dispatchAlert(alert: SentinelAlert, config: NotifyChannelConfig): void {
  if (config.macos_notification) {
    sendMacOSNotification(alert)
  }

  if (config.vault_log) {
    sendVaultLog(alert, config.vault_path)
  }

  if (config.slack_webhook) {
    sendSlackWebhook(alert, config.slack_webhook)
  }
}
