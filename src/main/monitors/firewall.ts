import { stat, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import type { FirewallRule, FirewallState } from '../../shared/types'
import { isMacOS } from '../platform'

const execFileAsync = promisify(execFile)
const LULU_RULES_PATH = '/Library/Objective-See/LuLu/rules.plist'

/** Build candidate paths for the Python parser script. */
function getParserPaths(): string[] {
  const candidates = [
    join(__dirname, '../../src/main/monitors/lulu-parser.py'),
    join(process.cwd(), 'src/main/monitors/lulu-parser.py')
  ]
  // In packaged Electron app, try relative to resources
  try {
    const { app } = require('electron')
    candidates.unshift(join(app.getAppPath(), 'src/main/monitors/lulu-parser.py'))
  } catch {
    // Not in Electron context (e.g. tests)
  }
  return candidates
}

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
 * Uses regex-based extraction — works with XML plists only.
 * For binary plists, use parseLuluRulesJson() instead.
 */
export function parseLuluRules(xmlContent: string): FirewallRule[] {
  const rules: FirewallRule[] = []

  const rulesMatch = xmlContent.match(
    /<key>rules<\/key>\s*<dict>([\s\S]*?)<\/dict>\s*<\/dict>\s*<\/plist>/
  )
  if (!rulesMatch) return rules

  const rulesBlock = rulesMatch[1]

  const entryRegex = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
  let entryMatch: RegExpExecArray | null

  while ((entryMatch = entryRegex.exec(rulesBlock)) !== null) {
    const binaryPath = entryMatch[1]
    const innerDict = entryMatch[2]

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
 * Parse LuLu rules from JSON output of the Python helper script.
 * Handles NSKeyedArchiver binary plist format that regex can't parse.
 */
export function parseLuluRulesJson(jsonOutput: string): FirewallRule[] {
  try {
    const parsed = JSON.parse(jsonOutput) as Array<{
      path: string
      name: string
      action: string
      type: string
    }>
    return parsed.map((r) => ({
      path: r.path,
      name: r.name,
      action: r.action === 'block' ? ('block' as const) : ('allow' as const),
      type: r.type === 'system' ? ('system' as const) : ('user' as const)
    }))
  } catch {
    return []
  }
}

/**
 * Read and parse LuLu firewall rules.
 * Uses Python helper to parse NSKeyedArchiver binary plist, with XML fallback.
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

    // Use Python helper to parse NSKeyedArchiver binary plist.
    // All arguments are hardcoded constants — no user input.
    let rules: FirewallRule[] = []
    const parserPaths = getParserPaths()

    for (const parserPath of parserPaths) {
      try {
        await access(parserPath)
        const { stdout } = await execFileAsync('python3', [parserPath, LULU_RULES_PATH], {
          timeout: 10000
        })
        rules = parseLuluRulesJson(stdout)
        if (rules.length > 0) break
      } catch {
        continue
      }
    }

    if (rules.length === 0) {
      console.warn('[firewall] Python parser found no rules. Tried paths:', parserPaths)
    }

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
