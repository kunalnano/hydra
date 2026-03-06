import { describe, it, expect, beforeEach } from 'vitest'
import { parseLuluRules, resetFirewallCache } from './firewall'

const SAMPLE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>rules</key>
  <dict>
    <key>/Applications/Safari.app/Contents/MacOS/Safari</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
      <key>type</key>
      <integer>0</integer>
    </dict>
    <key>/usr/bin/curl</key>
    <dict>
      <key>action</key>
      <integer>0</integer>
      <key>type</key>
      <integer>1</integer>
    </dict>
  </dict>
</dict>
</plist>`

describe('parseLuluRules', () => {
  beforeEach(() => {
    resetFirewallCache()
  })

  it('parses sample plist into FirewallRule array', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    expect(rules).toHaveLength(2)
  })

  it('extracts binary path correctly', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    expect(rules[0].path).toBe('/Applications/Safari.app/Contents/MacOS/Safari')
    expect(rules[1].path).toBe('/usr/bin/curl')
  })

  it('maps action 1 to allow', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    const safari = rules.find((r) => r.path.includes('Safari'))
    expect(safari?.action).toBe('allow')
  })

  it('maps action 0 to block', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    const curl = rules.find((r) => r.path.includes('curl'))
    expect(curl?.action).toBe('block')
  })

  it('maps type 0 to user', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    const safari = rules.find((r) => r.path.includes('Safari'))
    expect(safari?.type).toBe('user')
  })

  it('maps type 1 to system', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    const curl = rules.find((r) => r.path.includes('curl'))
    expect(curl?.type).toBe('system')
  })

  it('extracts display name from path', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    const safari = rules.find((r) => r.path.includes('Safari'))
    expect(safari?.name).toBe('Safari')

    const curl = rules.find((r) => r.path.includes('curl'))
    expect(curl?.name).toBe('curl')
  })

  it('extracts name from deeply nested app path', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>rules</key>
  <dict>
    <key>/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/Current/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
      <key>type</key>
      <integer>0</integer>
    </dict>
  </dict>
</dict>
</plist>`
    const rules = parseLuluRules(plist)
    expect(rules).toHaveLength(1)
    expect(rules[0].name).toBe('Google Chrome Helper')
  })

  it('returns empty array for empty XML', () => {
    const rules = parseLuluRules('')
    expect(rules).toEqual([])
  })

  it('returns empty array for malformed XML without rules key', () => {
    const rules = parseLuluRules(
      '<plist><dict><key>other</key><string>value</string></dict></plist>'
    )
    expect(rules).toEqual([])
  })

  it('returns empty array for XML with empty rules dict', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>rules</key>
  <dict>
  </dict>
</dict>
</plist>`
    const rules = parseLuluRules(plist)
    expect(rules).toEqual([])
  })

  it('skips entries missing an action key', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>rules</key>
  <dict>
    <key>/usr/bin/no-action</key>
    <dict>
      <key>type</key>
      <integer>0</integer>
    </dict>
    <key>/usr/bin/has-action</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
      <key>type</key>
      <integer>0</integer>
    </dict>
  </dict>
</dict>
</plist>`
    const rules = parseLuluRules(plist)
    expect(rules).toHaveLength(1)
    expect(rules[0].path).toBe('/usr/bin/has-action')
  })

  it('defaults type to user when type key is missing', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>rules</key>
  <dict>
    <key>/usr/bin/notype</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
    </dict>
  </dict>
</dict>
</plist>`
    const rules = parseLuluRules(plist)
    expect(rules).toHaveLength(1)
    expect(rules[0].type).toBe('user')
  })
})

describe('totalAllowed and totalBlocked counts', () => {
  it('counts allowed and blocked rules correctly from sample', () => {
    const rules = parseLuluRules(SAMPLE_PLIST)
    const totalAllowed = rules.filter((r) => r.action === 'allow').length
    const totalBlocked = rules.filter((r) => r.action === 'block').length
    expect(totalAllowed).toBe(1)
    expect(totalBlocked).toBe(1)
  })

  it('counts correctly with multiple rules', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>rules</key>
  <dict>
    <key>/usr/bin/a</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
      <key>type</key>
      <integer>0</integer>
    </dict>
    <key>/usr/bin/b</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
      <key>type</key>
      <integer>0</integer>
    </dict>
    <key>/usr/bin/c</key>
    <dict>
      <key>action</key>
      <integer>0</integer>
      <key>type</key>
      <integer>1</integer>
    </dict>
    <key>/usr/bin/d</key>
    <dict>
      <key>action</key>
      <integer>0</integer>
      <key>type</key>
      <integer>0</integer>
    </dict>
    <key>/usr/bin/e</key>
    <dict>
      <key>action</key>
      <integer>1</integer>
      <key>type</key>
      <integer>1</integer>
    </dict>
  </dict>
</dict>
</plist>`
    const rules = parseLuluRules(plist)
    const totalAllowed = rules.filter((r) => r.action === 'allow').length
    const totalBlocked = rules.filter((r) => r.action === 'block').length
    expect(rules).toHaveLength(5)
    expect(totalAllowed).toBe(3)
    expect(totalBlocked).toBe(2)
  })
})
