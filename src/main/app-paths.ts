import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join } from 'path'
import { config as dotenvConfig } from 'dotenv'

const PACKAGE_JSON = 'package.json'
const SOURCE_MAIN_ROOT = join('src', 'main')
const RESOURCE_ROOT = 'app-resources'

let cachedAppRoot: string | null = null
let cachedEnvPath: string | null = null
let environmentLoaded = false

function findUp(startDir: string, marker: string): string | null {
  let current = startDir

  while (true) {
    if (existsSync(join(current, marker))) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

function uniquePaths(paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const candidate of paths) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    ordered.push(candidate)
  }

  return ordered
}

function getPackagedResourceRoot(): string | null {
  if (typeof process.resourcesPath !== 'string' || process.resourcesPath.length === 0) {
    return null
  }
  return join(process.resourcesPath, RESOURCE_ROOT)
}

export function getAppRoot(): string {
  if (cachedAppRoot) {
    return cachedAppRoot
  }

  cachedAppRoot =
    findUp(__dirname, PACKAGE_JSON) ??
    findUp(process.cwd(), PACKAGE_JSON) ??
    join(__dirname, '..', '..')

  return cachedAppRoot
}

export function resolveRepoPath(...segments: string[]): string {
  return join(getAppRoot(), ...segments)
}

export function resolveMainAssetPath(...segments: string[]): string {
  const candidates = uniquePaths([
    join(__dirname, ...segments),
    join(getAppRoot(), SOURCE_MAIN_ROOT, ...segments),
    getPackagedResourceRoot() ? join(getPackagedResourceRoot()!, ...segments) : null
  ])

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0] ?? join(getAppRoot(), SOURCE_MAIN_ROOT, ...segments)
}

export function loadEnvironment(): string | null {
  if (environmentLoaded) {
    return cachedEnvPath
  }

  environmentLoaded = true

  const configuredEnvPath = process.env.HELM_ENV_PATH?.trim()
  const candidatePaths = uniquePaths([
    configuredEnvPath ? resolvePathSetting(configuredEnvPath) : null,
    resolveRepoPath('.env')
  ])

  const envPath = candidatePaths.find((candidate) => existsSync(candidate))
  if (!envPath) {
    return null
  }

  dotenvConfig({ path: envPath, quiet: true })
  cachedEnvPath = envPath
  return cachedEnvPath
}

export function resolvePathSetting(rawValue: string, baseDir = getAppRoot()): string {
  const value = rawValue.trim()
  if (!value) return value

  if (value === '~') {
    return homedir()
  }

  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return join(homedir(), value.slice(2))
  }

  if (isAbsolute(value)) {
    return value
  }

  return join(baseDir, value)
}

export function resolveCommandOrPathSetting(rawValue: string, baseDir = getAppRoot()): string {
  const value = rawValue.trim()
  if (!value) return value

  if (
    isAbsolute(value) ||
    value.includes('/') ||
    value.includes('\\') ||
    value.startsWith('.') ||
    value.startsWith('~')
  ) {
    return resolvePathSetting(value, baseDir)
  }

  return value
}
