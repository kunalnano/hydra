import { readFile, stat } from 'fs/promises'
import type { FirewallRule, FirewallState } from '../../shared/types'
import { isMacOS } from '../platform'

const LULU_RULES_PATH = '/Library/Objective-See/LuLu/rules.plist'

let cachedState: FirewallState | null = null
let cachedMtime: number = 0

/**
 * Extract display name from a binary path.
 * e.g. "/Applications/Chrome.app/Contents/MacOS/Google Chrome" -> "Google Chrome"
 * e.g. "/usr/bin/curl" -> "curl"
 */
function extractName(path: string): string {
  const last = path.split('/').pop()
  return last || path
}

/**
 * Parse a LuLu rules.plist XML string into FirewallRule[].
 * Uses regex-based extraction with no external dependencies.
 */
export function parseLuluRules(xmlContent: string): FirewallRule[] {
  const rules: FirewallRule[] = []

  // Find the outer <dict> under the "rules" key.
  // Structure: <key>rules</key> <dict> ... </dict>
  const rulesMatch = xmlContent.match(
    /<key>rules<\/key>\s*<dict>([\s\S]*?)<\/dict>\s*<\/dict>\s*<\/plist>/
  )
  if (!rulesMatch) return rules

  const rulesBlock = rulesMatch[1]

  // Each rule entry is: <key>/path/to/binary</key> <dict>...</dict>
  // The inner dict should not contain nested dicts (LuLu format is flat).
  const entryRegex = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
  let entryMatch: RegExpExecArray | null

  while ((entryMatch = entryRegex.exec(rulesBlock)) !== null) {
    const binaryPath = entryMatch[1]
    const innerDict = entryMatch[2]

    // Parse inner dict key-value pairs
    const actionMatch = innerDict.match(/<key>action<\/key>\s*<integer>(\d+)<\/integer>/)
    const typeMatch = innerDict.match(/<key>type<\/key>\s*<integer>(\d+)<\/integer>/)

    if (!actionMatch) continue

    const actionInt = parseInt(actionMatch[1], 10)
    const typeInt = typeMatch ? parseInt(typeMatch[1], 10) : 0

    rules.push({
      path: binaryPath,
      name: extractName(binaryPath),
      action: actionInt === 0 ? 'block' : 'allow',
      type: typeInt === 1 ? 'system' : 'user'
    })
  }

  return rules
}

/**
 * Read and parse LuLu firewall rules.
 * Caches result and only re-parses when the file's mtime changes.
 */
export async function getFirewallRules(): Promise<FirewallState> {
  if (!isMacOS()) {
    return { rules: [], totalAllowed: 0, totalBlocked: 0, lastUpdated: Date.now() }
  }

  try {
    const fileStat = await stat(LULU_RULES_PATH)
    const mtime = fileStat.mtimeMs

    if (cachedState && mtime === cachedMtime) {
      return cachedState
    }

    const content = await readFile(LULU_RULES_PATH, 'utf-8')
    const rules = parseLuluRules(content)

    const totalAllowed = rules.filter((r) => r.action === 'allow').length
    const totalBlocked = rules.filter((r) => r.action === 'block').length

    cachedState = {
      rules,
      totalAllowed,
      totalBlocked,
      lastUpdated: Date.now()
    }
    cachedMtime = mtime

    return cachedState
  } catch {
    return {
      rules: [],
      totalAllowed: 0,
      totalBlocked: 0,
      lastUpdated: Date.now()
    }
  }
}

/**
 * Reset the internal cache. Used for test cleanup.
 */
export function resetFirewallCache(): void {
  cachedState = null
  cachedMtime = 0
}
