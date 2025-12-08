import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import chalk from "chalk";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// --- Path Utilities ---

export function expandPath(p: string): string {
  if (!p) return "";
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export async function ensureDir(dir: string): Promise<void> {
  const expanded = expandPath(dir);
  try {
    await fs.access(expanded);
  } catch {
    await fs.mkdir(expanded, { recursive: true });
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(expandPath(filePath));
    return true;
  } catch {
    return false;
  }
}

export async function checkDiskSpace(dirPath: string): Promise<{ ok: boolean; free: string }> {
  try {
    const expanded = expandPath(dirPath);
    await ensureDir(expanded);
    const { stdout } = await execAsync(`df -h "${expanded}" | tail -1 | awk '{print $4}'`);
    return { ok: true, free: stdout.trim() };
  } catch {
    return { ok: true, free: "unknown" }; 
  }
}

// --- File Locking ---

export async function withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const lockFile = `${expandPath(filePath)}.lock`;
  const maxRetries = 10;
  const retryDelay = 100; // ms

  for (let i = 0; i < maxRetries; i++) {
    try {
      // "wx" flag fails if file exists
      await fs.writeFile(lockFile, process.pid.toString(), { flag: "wx" });
      
      try {
        return await operation();
      } finally {
        await fs.unlink(lockFile);
      }
    } catch (err: any) {
      if (err.code === "EEXIST") {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not acquire lock for ${filePath} after ${maxRetries} attempts.`);
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const expanded = expandPath(filePath);
  await ensureDir(path.dirname(expanded));
  
  const tempPath = `${expanded}.tmp.${crypto.randomBytes(4).toString("hex")}`;
  
  try {
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, expanded);
  } catch (err: any) {
    try { await fs.unlink(tempPath); } catch {} 
    throw new Error(`Failed to atomic write to ${expanded}: ${err.message}`);
  }
}

// --- Content & Hashing ---

export function hashContent(content: string): string {
  if (!content) return crypto.createHash("sha256").update("").digest("hex").substring(0, 16);
  
  const normalized = content
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
    
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  
  // Improved regex: Keeps technical terms like C++, node.js, user_id
  // Matches:
  // - Sequences of alphanumeric chars including dots, underscores, hyphens, pluses
  // - But avoids trailing dots
  
  // This is a heuristic for code-heavy text
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:[._\-+]+[a-z0-9]+)*|[a-z0-9]+/g);
  
  return (tokens || [])
    .filter(t => t.length >= 2); // Min length 2
}

export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return intersection.size / union.size;
}

// --- ID Generation ---

export function generateBulletId(): string {
  const timestamp36 = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `b-${timestamp36}-${random}`;
}

export function generateDiaryId(sessionPath: string): string {
  const hash = hashContent(sessionPath + Date.now());
  return `diary-${hash}`;
}

// --- Date/Time ---

export function now(): string {
  return new Date().toISOString();
}

export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

// --- Text & NLP ---

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "can", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before",
  "after", "and", "or", "but", "if", "when", "where", "why", "how", "this", "that",
  "these", "those", "what", "which", "who", "there", "here", "i", "you", "he", "she",
  "it", "we", "they", "me", "him", "her", "us", "them"
]);

export function extractKeywords(text: string): string[] {
  const tokens = tokenize(text);
  const keywords = tokens.filter(t => !STOP_WORDS.has(t));
  
  const counts: Record<string, number> = {};
  keywords.forEach(k => counts[k] = (counts[k] || 0) + 1);
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);
}

export function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  if (maxLen < 3) return text.slice(0, maxLen);
  return text.slice(0, maxLen - 3) + "...";
}

// --- Deprecated pattern detection ---

function buildDeprecatedMatcher(pattern: string): (text: string) => boolean {
  if (!pattern) return () => false;

  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    const body = pattern.slice(1, -1);
    const regex = new RegExp(body);
    return (text: string) => regex.test(text);
  }

  return (text: string) => text.includes(pattern);
}

export function checkDeprecatedPatterns(
  history: Array<{ snippet?: string }> = [],
  deprecatedPatterns: Array<{ pattern: string; replacement?: string; reason?: string }> = []
): string[] {
  if (!history.length || !deprecatedPatterns.length) return [];

  const warnings = new Set<string>();

  for (const deprecated of deprecatedPatterns) {
    if (!deprecated?.pattern) continue;

    const matches = buildDeprecatedMatcher(deprecated.pattern);

    for (const hit of history) {
      const snippet = hit?.snippet;
      if (!snippet) continue;

      if (matches(snippet)) {
        const reasonSuffix = deprecated.reason ? ` (Reason: ${deprecated.reason})` : "";
        const replacement = deprecated.replacement ? ` - use ${deprecated.replacement} instead` : "";
        warnings.add(`${deprecated.pattern} was deprecated${replacement}${reasonSuffix}`);
        break;
      }
    }
  }

  return Array.from(warnings);
}

// --- Scoring ---

export function scoreBulletRelevance(
  bulletContent: string,
  bulletTags: string[],
  keywords: string[]
): number {
  if (!bulletContent || keywords.length === 0) return 0;
  
  let score = 0;
  const contentLower = bulletContent.toLowerCase();
  const tagsLower = bulletTags.map(t => t.toLowerCase());
  
  // Tokenize once
  const contentTokens = new Set(tokenize(contentLower));

  for (const keyword of keywords) {
    const k = keyword.toLowerCase();
    
    // Exact match in token set (fast)
    if (contentTokens.has(k)) {
        score += 3;
    } 
    // Partial string match (slower fallback for "auth" -> "authenticate")
    else if (contentLower.includes(k)) {
        score += 1;
    }
    
    if (tagsLower.includes(k)) {
        score += 5; // Higher weight for explicit tags
    }
  }
  
  return score;
}

export function extractAgentFromPath(sessionPath: string): string {
  const lower = sessionPath.toLowerCase();
  if (lower.includes(".claude")) return "claude";
  if (lower.includes(".cursor")) return "cursor";
  if (lower.includes(".codex")) return "codex";
  if (lower.includes(".aider")) return "aider";
  return "unknown";
}

// --- Search Suggestions ---

/**
 * Problem-oriented terms to include in search suggestions.
 * These help surface debugging and troubleshooting context.
 */
const PROBLEM_TERMS = ["error", "fix", "bug", "issue", "problem", "fail", "debug"];

/**
 * Generate human-readable cass search suggestions for follow-up investigation.
 *
 * Creates 3-5 ready-to-run cass commands that the user can execute to dig deeper
 * if the provided context isn't sufficient.
 *
 * @param task - The original task description
 * @param keywords - Extracted keywords from the task
 * @param options - Optional configuration
 * @param options.preferredAgent - Agent to filter by (e.g., "claude")
 * @param options.maxSuggestions - Maximum number of suggestions (default: 5)
 * @returns Array of formatted cass command strings
 *
 * @example
 * generateSuggestedQueries("Fix authentication timeout bug", ["authentication", "timeout", "token"])
 * // Returns:
 * // [
 * //   'cass search "authentication timeout" --days 30',
 * //   'cass search "token error" --days 60',
 * //   'cass search "authentication" --days 90',
 * //   ...
 * // ]
 */
export function generateSuggestedQueries(
  task: string,
  keywords: string[],
  options: { preferredAgent?: string; maxSuggestions?: number } = {}
): string[] {
  const { preferredAgent, maxSuggestions = 5 } = options;
  const queries: string[] = [];
  const seenQueries = new Set<string>();

  // Helper to add query if not duplicate
  const addQuery = (query: string, days: number, agent?: string): void => {
    if (queries.length >= maxSuggestions) return;

    // Escape quotes in query
    const escapedQuery = query.replace(/"/g, '\\"');
    const key = `${escapedQuery}-${days}-${agent || ""}`;

    if (!seenQueries.has(key)) {
      seenQueries.add(key);
      let cmd = `cass search "${escapedQuery}" --days ${days}`;
      if (agent) cmd += ` --agent ${agent}`;
      queries.push(cmd);
    }
  };

  // 1. Multi-keyword phrase query (first 2-3 keywords combined)
  if (keywords.length >= 2) {
    const phrase = keywords.slice(0, 3).join(" ");
    addQuery(phrase, 30);
  }

  // 2. Single keyword with problem term (find error/fix patterns)
  if (keywords.length > 0) {
    const topKeyword = keywords[0];

    // Check if task already contains problem terms
    const taskLower = task.toLowerCase();
    const hasProblemTerm = PROBLEM_TERMS.some(term => taskLower.includes(term));

    if (!hasProblemTerm) {
      // Add error-oriented query if task doesn't have problem terms
      addQuery(`${topKeyword} error`, 60);
    } else {
      // Task already has problem context, search for solutions
      addQuery(`${topKeyword} fix`, 60);
    }
  }

  // 3. Broad single keyword query with longer lookback
  if (keywords.length > 0) {
    addQuery(keywords[0], 90);
  }

  // 4. Second keyword with agent filter if available
  if (keywords.length > 1 && preferredAgent) {
    addQuery(keywords[1], 60, preferredAgent);
  }

  // 5. Keyword combination with medium lookback
  if (keywords.length >= 2) {
    const twoKeywords = keywords.slice(0, 2).join(" ");
    addQuery(twoKeywords, 60);
  }

  // 6. Third keyword or pattern with longer lookback if space
  if (keywords.length >= 3 && queries.length < maxSuggestions) {
    addQuery(keywords[2], 90);
  }

  return queries;
}

// --- Logging ---

export function log(msg: string, verbose = false): void {
  if (verbose || process.env.CASS_MEMORY_VERBOSE === "true" || process.env.CASS_MEMORY_VERBOSE === "1") {
    console.error(chalk.blue("[cass-memory]"), msg);
  }
}

export function error(msg: string): void {
  console.error(chalk.red("[cass-memory] ERROR:"), msg);
}

export function warn(msg: string): void {
  console.error(chalk.yellow("[cass-memory] WARNING:"), msg);
}