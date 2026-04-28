// Consolidated ECZ subject name matcher — single source of truth for
// both OCR grade extraction and wizard controller subject resolution.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Expand a normalized name into all equivalent forms to try for exact match. */
function expandCandidates(name: string): string[] {
  const out = [name]

  // Abbreviation / alias expansion
  const mapped = ALIASES[name]
  if (mapped) out.push(mapped)

  // "Ordinary" prefix: strip or prepend
  if (name.startsWith('ordinary ')) {
    out.push(name.slice(9))
  } else {
    out.push('ordinary ' + name)
  }

  // " language" suffix: strip
  if (name.endsWith(' language')) {
    out.push(name.slice(0, -9).trim())
  }

  return out
}

// Merged alias map: abbreviations + ECZ naming variants (bidirectional)
const ALIASES: Record<string, string> = {
  // abbreviations
  'maths': 'mathematics',
  'math': 'mathematics',
  'eng': 'english',
  'bio': 'biology',
  'chem': 'chemistry',
  'phy': 'physics',
  'add maths': 'additional mathematics',
  'additional math': 'additional mathematics',
  'add math': 'additional mathematics',
  // ECZ naming variants (bidirectional)
  'civics': 'civic education',
  'civic education': 'civics',
  'commerce': 'commercial studies',
  'commercial studies': 'commerce',
  'combined science': 'science',
  'physical science': 'science',
  'ordinary science': 'science',
}

function levenshtein(a: string, b: string): number {
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  const matrix: number[][] = Array.from({ length: al + 1 }, () => Array(bl + 1).fill(0))
  for (let i = 0; i <= al; i++) matrix[i]![0] = i
  for (let j = 0; j <= bl; j++) matrix[0]![j] = j
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      )
    }
  }
  return matrix[al]![bl]!
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)
  let matches = 0
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue
      if (s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let t = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) t++
    k++
  }
  t = t / 2
  const jaro = ((matches / len1) + (matches / len2) + ((matches - t) / matches)) / 3
  let prefix = 0
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

export function findBestSubjectId(
  parsedName: string,
  subjects: Array<{ id: string; name?: string; code?: string }>,
): string | null {
  if (!parsedName) return null
  const target = normalize(parsedName)
  if (!target) return null

  // Build normalized candidate names for each catalog subject once
  const catalog = subjects.map(s => ({
    id: s.id,
    norm: normalize(s.name || s.code || ''),
  })).filter(c => c.norm)

  // Phase 1: exact match using all expanded forms of the input
  const expansions = expandCandidates(target)
  for (const exp of expansions) {
    for (const c of catalog) {
      if (c.norm === exp) return c.id
    }
    // Also try expanding each catalog name to match against the raw target
  }
  // Try the reverse: expand each catalog name and match against target
  for (const c of catalog) {
    const catExpansions = expandCandidates(c.norm)
    for (const ce of catExpansions) {
      if (ce === target) return c.id
    }
  }

  // Phase 2: token overlap + Levenshtein (use alias-mapped target)
  const mappedTarget = ALIASES[target] || target
  let bestId: string | null = null
  let bestScore = Infinity

  for (const c of catalog) {
    const targetTokens = mappedTarget.split(' ')
    const candidateTokens = c.norm.split(' ')
    const common = targetTokens.filter(t => candidateTokens.includes(t)).length
    const overlap = common / Math.max(targetTokens.length, candidateTokens.length)
    if (overlap >= 0.6) {
      const lengthPenalty = Math.abs(candidateTokens.length - targetTokens.length) / Math.max(targetTokens.length, candidateTokens.length)
      const tokenScore = 0.1 + lengthPenalty
      if (tokenScore < bestScore) {
        bestScore = tokenScore
        bestId = c.id
      }
      continue
    }

    const dist = levenshtein(mappedTarget, c.norm)
    const rel = dist / Math.max(mappedTarget.length, c.norm.length)
    if (rel < bestScore) {
      bestScore = rel
      bestId = c.id
    }
  }

  if (bestScore !== Infinity && bestScore <= 0.35) return bestId

  // Phase 3: Jaro-Winkler fallback
  let bestJWId: string | null = null
  let bestJW = 0
  for (const c of catalog) {
    const sim = jaroWinkler(mappedTarget, c.norm)
    if (sim > bestJW) {
      bestJW = sim
      bestJWId = c.id
    }
  }
  if (bestJW >= 0.86) return bestJWId

  return null
}
