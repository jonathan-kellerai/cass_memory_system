/**
 * Rule Validation for Playbook Quality Control
 *
 * Validates rules before adding to prevent duplicates and low-quality entries.
 * Uses existing infrastructure: semantic search for similarity, keyword matching for categories.
 */

import { Playbook } from "./types.js";
import { findSimilarBulletsSemantic } from "./semantic.js";
import { detectCategories, RuleCategory } from "./gap-analysis.js";
import { getActiveBullets } from "./playbook.js";

/**
 * Severity levels for validation warnings
 */
export type ValidationSeverity = "error" | "warning" | "suggestion";

/**
 * Types of validation checks
 */
export type ValidationType = "similarity" | "quality" | "category";

/**
 * Individual validation warning
 */
export interface ValidationWarning {
  type: ValidationType;
  message: string;
  severity: ValidationSeverity;
  details?: {
    similarRuleId?: string;
    similarityScore?: number;
    wordCount?: number;
    suggestedCategory?: RuleCategory;
    detectedCategories?: RuleCategory[];
  };
}

/**
 * Complete validation result
 */
export interface ValidationResult {
  /** Whether the rule passes validation (no errors) */
  valid: boolean;
  /** All warnings from validation checks */
  warnings: ValidationWarning[];
  /** Suggestions for improving the rule */
  suggestions: {
    category?: RuleCategory;
    reason?: string;
  };
}

/**
 * Options for validation
 */
export interface ValidateRuleOptions {
  /** Similarity threshold (default: 0.8) */
  similarityThreshold?: number;
  /** Minimum word count (default: 10) */
  minWords?: number;
  /** Maximum word count before suggesting split (default: 100) */
  maxWords?: number;
  /** Skip semantic similarity check (faster but less thorough) */
  skipSimilarity?: boolean;
  /** Embedding model for semantic search */
  model?: string;
}

/** Stop-words to exclude from keyword similarity (too common to be meaningful) */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "shall", "should", "may", "might", "can", "could", "not", "this", "that",
  "it", "its", "they", "them", "their", "you", "your", "we", "our"
]);

/**
 * Compute Jaccard similarity between two texts using word tokens.
 * Returns a value in [0, 1] where 1 means identical token sets.
 */
function keywordSimilarity(a: string, b: string): number {
  const tokenize = (text: string): Set<string> => {
    const words = text.toLowerCase().split(/\W+/).filter(
      w => w.length > 2 && !STOP_WORDS.has(w)
    );
    return new Set(words);
  };
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Context words that indicate specific applicability */
const CONTEXT_WORDS = ["when", "if", "before", "after", "always", "never", "only", "unless", "during", "while"];

/** Generic/vague words that don't add specificity */
const VAGUE_WORDS = ["thing", "stuff", "good", "bad", "nice", "better", "best", "use", "make", "do", "get"];

/**
 * Count words in text (simple tokenization)
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if text contains any of the given words (case-insensitive)
 */
function containsAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some(word => {
    // Match word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(lower);
  });
}

/**
 * Check if text is mostly vague words
 */
function isTooVague(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length < 5) return false; // Too short to judge

  const vagueCount = words.filter(w => VAGUE_WORDS.includes(w)).length;
  return vagueCount / words.length > 0.4; // More than 40% vague words
}

/**
 * Validate a rule's quality using heuristics
 */
function validateQuality(
  content: string,
  options: ValidateRuleOptions
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const minWords = options.minWords ?? 10;
  const maxWords = options.maxWords ?? 100;

  const wordCount = countWords(content);

  // Check length
  if (wordCount < minWords) {
    warnings.push({
      type: "quality",
      message: `Rule is too short (${wordCount} words). Consider adding more context.`,
      severity: "warning",
      details: { wordCount },
    });
  } else if (wordCount > maxWords) {
    warnings.push({
      type: "quality",
      message: `Rule is quite long (${wordCount} words). Consider splitting into multiple rules.`,
      severity: "suggestion",
      details: { wordCount },
    });
  }

  // Check for context words
  if (!containsAny(content, CONTEXT_WORDS)) {
    warnings.push({
      type: "quality",
      message: "Rule lacks context. Consider specifying when/where this applies.",
      severity: "suggestion",
    });
  }

  // Check for vagueness
  if (isTooVague(content)) {
    warnings.push({
      type: "quality",
      message: "Rule seems too vague. Consider being more specific.",
      severity: "warning",
    });
  }

  return warnings;
}

/**
 * Validate category match using keyword detection
 */
function validateCategory(
  content: string,
  providedCategory: string
): { warnings: ValidationWarning[]; suggestedCategory?: RuleCategory } {
  const warnings: ValidationWarning[] = [];
  const detectedCategories = detectCategories(content);

  // If no category provided and we detected some, suggest one
  if (!providedCategory && detectedCategories.length > 0) {
    return {
      warnings: [{
        type: "category",
        message: `No category provided. Based on content, consider: ${detectedCategories[0]}`,
        severity: "suggestion",
        details: { suggestedCategory: detectedCategories[0], detectedCategories },
      }],
      suggestedCategory: detectedCategories[0],
    };
  }

  // If category provided but doesn't match detected categories
  if (providedCategory && detectedCategories.length > 0) {
    const providedLower = providedCategory.toLowerCase();
    const matchesProvided = detectedCategories.some(c => c === providedLower);

    if (!matchesProvided && detectedCategories[0] !== providedLower) {
      // Only warn if the detected category is significantly different
      const topDetected = detectedCategories[0];
      warnings.push({
        type: "category",
        message: `Category '${providedCategory}' may not match content. Detected: ${topDetected}`,
        severity: "suggestion",
        details: { suggestedCategory: topDetected, detectedCategories },
      });
      return { warnings, suggestedCategory: topDetected };
    }
  }

  return { warnings };
}

/**
 * Validate a rule before adding to the playbook
 *
 * Performs three types of checks:
 * 1. Similarity - warns if >0.8 similar to existing rule (uses semantic search)
 * 2. Quality - checks word count, context words, vagueness
 * 3. Category - suggests better category if mismatch detected
 *
 * @param content - The rule content to validate
 * @param category - The intended category (optional)
 * @param playbook - The playbook to check against
 * @param options - Validation options
 * @returns ValidationResult with valid flag, warnings, and suggestions
 */
export async function validateRule(
  content: string,
  category: string,
  playbook: Playbook,
  options: ValidateRuleOptions = {}
): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];
  const threshold = options.similarityThreshold ?? 0.8;

  // 1. Similarity check (most expensive, can be skipped)
  if (!options.skipSimilarity) {
    const activeBullets = getActiveBullets(playbook);

    if (activeBullets.length > 0) {
      let semanticChecked = false;
      try {
        const similar = await findSimilarBulletsSemantic(
          content,
          activeBullets,
          1, // Only need top match
          { threshold, model: options.model }
        );

        if (similar.length > 0 && similar[0].similarity >= threshold) {
          semanticChecked = true;
          const match = similar[0];
          warnings.push({
            type: "similarity",
            message: `Similar to existing rule '${match.bullet.id}' (${(match.similarity * 100).toFixed(0)}% similar)`,
            severity: "warning",
            details: {
              similarRuleId: match.bullet.id,
              similarityScore: match.similarity,
            },
          });
        } else if (similar.length > 0) {
          // Semantic search ran but found no match above threshold
          semanticChecked = true;
        }
      } catch {
        // Semantic search may fail offline; fall back to keyword similarity below
      }

      // Keyword-based fallback: run when semantic search was unavailable (embeddings
      // not cached / model not downloaded).  Uses Jaccard overlap on meaningful tokens,
      // which reliably catches near-duplicate phrasings without requiring a model.
      if (!semanticChecked) {
        for (const bullet of activeBullets) {
          const kwSim = keywordSimilarity(content, bullet.content);
          if (kwSim >= threshold) {
            warnings.push({
              type: "similarity",
              message: `Similar to existing rule '${bullet.id}' (${(kwSim * 100).toFixed(0)}% keyword overlap)`,
              severity: "warning",
              details: {
                similarRuleId: bullet.id,
                similarityScore: kwSim,
              },
            });
            break; // Only report the first match
          }
        }
      }
    }
  }

  // 2. Quality heuristics
  const qualityWarnings = validateQuality(content, options);
  warnings.push(...qualityWarnings);

  // 3. Category check
  const { warnings: categoryWarnings, suggestedCategory } = validateCategory(content, category);
  warnings.push(...categoryWarnings);

  // Determine if valid (no errors)
  const hasErrors = warnings.some(w => w.severity === "error");
  const valid = !hasErrors;

  // Build suggestions
  const suggestions: ValidationResult["suggestions"] = {};
  if (suggestedCategory) {
    suggestions.category = suggestedCategory;
    suggestions.reason = `Content keywords suggest '${suggestedCategory}' category`;
  }

  return { valid, warnings, suggestions };
}

/**
 * Format validation result for human display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.warnings.length === 0) {
    lines.push("  No issues found");
    return lines.join("\n");
  }

  for (const warning of result.warnings) {
    const icon = warning.severity === "error" ? "x"
      : warning.severity === "warning" ? "!"
      : "?";
    lines.push(`  ${icon} ${warning.message}`);
  }

  // Note: suggested category info is already in the category warning message,
  // so we don't add a separate line here to avoid redundancy

  return lines.join("\n");
}

/**
 * Check if validation result has any warnings (not just errors)
 */
export function hasWarnings(result: ValidationResult): boolean {
  return result.warnings.length > 0;
}

/**
 * Check if validation result has errors or warnings (excludes suggestions)
 */
export function hasIssues(result: ValidationResult): boolean {
  return result.warnings.some(w => w.severity === "error" || w.severity === "warning");
}
