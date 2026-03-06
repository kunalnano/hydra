/**
 * Late-night awareness: 22:00 - 05:00 is considered late night.
 * Used by auto-heal to suppress non-critical notifications.
 */
export function isLateNight(now: Date = new Date()): boolean {
  const hour = now.getHours()
  return hour >= 22 || hour < 5
}
