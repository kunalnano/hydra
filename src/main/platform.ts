export type Platform = 'macos' | 'linux' | 'windows'

export function getPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    default:
      return 'linux'
  }
}

export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

export function isLinux(): boolean {
  return process.platform === 'linux'
}

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function getDefaultShell(): string {
  if (isMacOS()) return '/bin/zsh'
  if (isWindows()) return 'cmd.exe'
  return '/bin/bash'
}
