export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeTags(tags: string[]): string[] {
  const deduped = new Set<string>()
  for (const tag of tags) {
    const normalized = normalizeTag(tag)
    if (normalized.length > 0) deduped.add(normalized)
  }
  return Array.from(deduped)
}
