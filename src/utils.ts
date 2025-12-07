import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import chalk from "chalk";

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

/**
 * Extract agent name from a session path.
 * Parses paths like ~/.claude/sessions/abc.jsonl → "claude"
 *
 * @param sessionPath - Path to a session file
 * @returns Agent name (lowercase) or "unknown"
 */
export function extractAgentFromPath(sessionPath: string): string {
  if (!sessionPath) return "unknown";

  // Normalize the path
  const normalized = expandPath(sessionPath).toLowerCase();

  // Known agent patterns in session paths
  const agentPatterns = [
    { pattern: /\.claude\b/, agent: "claude" },
    { pattern: /\.cursor\b/, agent: "cursor" },
    { pattern: /\.codex\b/, agent: "codex" },
    { pattern: /\.aider\b/, agent: "aider" },
    { pattern: /\.gemini\b/, agent: "gemini" },
    { pattern: /\.chatgpt\b/, agent: "chatgpt" },
    { pattern: /\.copilot\b/, agent: "copilot" },
    { pattern: /\.windsurf\b/, agent: "windsurf" },
  ];

  for (const { pattern, agent } of agentPatterns) {
    if (pattern.test(normalized)) {
      return agent;
    }
  }

  // Try to extract from directory structure
  // e.g., /home/user/.config/claude/sessions/... → claude
  const parts = normalized.split(path.sep);
  for (const part of parts) {
    if (part.startsWith(".")) {
      const cleaned = part.slice(1);
      if (agentPatterns.some((p) => p.agent === cleaned)) {
        return cleaned;
      }
    }
  }

  return "unknown";
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
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3);
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
  
  // Count frequency
  const counts: Record<string, number> = {};
  keywords.forEach(k => counts[k] = (counts[k] || 0) + 1);
  
  // Sort by frequency and take top 10
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);
}

export function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
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
  
  for (const keyword of keywords) {
    if (contentLower.includes(keyword)) score += 2;
    if (tagsLower.some(t => t.includes(keyword))) score += 3;
  }
  
  return score;
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
