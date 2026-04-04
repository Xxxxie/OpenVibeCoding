/**
 * Formats a number into an abbreviated form (e.g., 1.1k, 2.5M)
 */
export function formatAbbreviatedNumber(num: number): string {
  if (num >= 1000000) {
    const formatted = (num / 1000000).toFixed(1)
    return formatted.endsWith('.0') ? `${Math.floor(num / 1000000)}M` : `${formatted}M`
  }

  if (num >= 1000) {
    const formatted = (num / 1000).toFixed(1)
    return formatted.endsWith('.0') ? `${Math.floor(num / 1000)}k` : `${formatted}k`
  }

  return num.toString()
}
