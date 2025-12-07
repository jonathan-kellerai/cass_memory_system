import { warn } from "./utils.js";

export interface SecretPattern {
  pattern: RegExp;
  replacement: string;
}

type ExtraPattern = RegExp | SecretPattern;

export interface SanitizationConfig {
  enabled: boolean;
  extraPatterns?: ExtraPattern[];
}

export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[AWS_ACCESS_KEY]" },
  { pattern: /[A-Za-z0-9/+=]{40}(?=\s|$|"|')/g, replacement: "[AWS_SECRET_KEY]" },

  // Bearer tokens (specific before generic token patterns)
  { pattern: /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g, replacement: "[BEARER_TOKEN]" },

  // GitHub tokens
  { pattern: /ghp_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_PAT]" },
  { pattern: /github_pat_[A-Za-z0-9_]{22,}/g, replacement: "[GITHUB_PAT]" },
  { pattern: /gho_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_OAUTH]" },
  { pattern: /ghu_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_USER_TOKEN]" },
  { pattern: /ghs_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_SERVER_TOKEN]" },
  { pattern: /ghr_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_REFRESH_TOKEN]" },

  // Slack tokens
  { pattern: /xox[baprs]-[A-Za-z0-9-]+/g, replacement: "[SLACK_TOKEN]" },

  // Private keys (multi-line)
  {
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replacement: "[PRIVATE_KEY]"
  },

  // Database URLs with credentials
  { pattern: /(postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/gi, replacement: "$1://[USER]:[PASS]@" },

  // Generic API keys/tokens (more general, so later in order)
  { pattern: /api[_-]?key["'\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[API_KEY]" },
  { pattern: /api[_-]?secret["'\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[API_SECRET]" },
  { pattern: /secret[_-]?key["'\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[SECRET_KEY]" },
  { pattern: /access[_-]?token["'\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[ACCESS_TOKEN]" },

  // Passwords in common formats
  // Fix: Regex captures the key and separator to preserve JSON syntax
  // Matches: "password": "...", password = "...", password='...'
  { pattern: /((?:password|passwd|pwd)["\s]*[:=]["\s]*)(["'])[^"']{8,}\2/gi, replacement: "$1$2[REDACTED]$2" },

  // OpenAI API keys
  { pattern: /sk-[A-Za-z0-9]{48}/g, replacement: "[OPENAI_API_KEY]" },
  { pattern: /sk-proj-[A-Za-z0-9\-_]{48,}/g, replacement: "[OPENAI_PROJECT_KEY]" },

  // Anthropic API keys
  { pattern: /sk-ant-[A-Za-z0-9\-_]{32,}/g, replacement: "[ANTHROPIC_API_KEY]" },

  // Stripe keys
  { pattern: /sk_live_[A-Za-z0-9]{24,}/g, replacement: "[STRIPE_SECRET_KEY]" },
  { pattern: /sk_test_[A-Za-z0-9]{24,}/g, replacement: "[STRIPE_TEST_KEY]" },
  { pattern: /pk_live_[A-Za-z0-9]{24,}/g, replacement: "[STRIPE_PUBLISHABLE_KEY]" },
  { pattern: /pk_test_[A-Za-z0-9]{24,}/g, replacement: "[STRIPE_TEST_PUBLISHABLE_KEY]" },

  // SendGrid
  { pattern: /SG\.[A-Za-z0-9\-_]{22,}\.[A-Za-z0-9\-_]{22,}/g, replacement: "[SENDGRID_API_KEY]" },

  // Twilio
  { pattern: /SK[a-f0-9]{32}/g, replacement: "[TWILIO_API_KEY]" },

  // npm tokens
  { pattern: /npm_[A-Za-z0-9]{36}/g, replacement: "[NPM_TOKEN]" },

  // Generic token pattern (most general, last)
  { pattern: /token["'\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[TOKEN]" },
];

const DEFAULT_EXTRA_REPLACEMENT = "[REDACTED_CUSTOM]";

const normalizeExtraPatterns = (extraPatterns?: ExtraPattern[]): SecretPattern[] => {
  if (!extraPatterns || extraPatterns.length === 0) return [];

  return extraPatterns.map((entry) => {
    if ((entry as SecretPattern).pattern && (entry as SecretPattern).replacement !== undefined) {
      const { pattern, replacement } = entry as SecretPattern;
      return { pattern, replacement };
    }
    const regex = entry as RegExp;
    return { pattern: regex, replacement: DEFAULT_EXTRA_REPLACEMENT };
  });
};

export function sanitize(
  text: string,
  config: SanitizationConfig = { enabled: true }
): string {
  if (!config.enabled) return text;

  let clean = text;

  // Apply built-in patterns
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    clean = clean.replace(pattern, replacement);
  }

  // Apply extra patterns (RegExp or SecretPattern)
  for (const { pattern, replacement } of normalizeExtraPatterns(config.extraPatterns)) {
    pattern.lastIndex = 0;
    clean = clean.replace(pattern, replacement);
  }

  return clean;
}

export function containsSecrets(text: string): boolean {
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

export function findSecrets(text: string): Array<{ type: string; match: string; position: number }> {
  const found: Array<{ type: string; match: string; position: number }> = [];

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      found.push({
        type: replacement.replace(/[\[\]]/g, ""),
        match: match[0].substring(0, 20) + (match[0].length > 20 ? "..." : ""),
        position: match.index
      });
    }
  }

  return found;
}

export function createSanitizer(config: SanitizationConfig): (text: string) => string {
  return (text: string) => sanitize(text, config);
}

export function compileExtraPatterns(patterns: string[]): RegExp[] {
  const valid: RegExp[] = [];
  for (const raw of patterns || []) {
    try {
      valid.push(new RegExp(raw, "gi"));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      warn(`[sanitize] Invalid regex pattern: ${raw} (${message})`);
    }
  }
  return valid;
}

export function verifySanitization(text: string): {
  containsPotentialSecrets: boolean;
  warnings: string[];
} {
  const warnings = new Set<string>();

  // Detect using built-in patterns (non-mutating)
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const sample = match[0].slice(0, 32);
      warnings.add(`Matches secret pattern ${replacement} (e.g., “…${sample}”)`);
    }
  }

  // Heuristics for things we might have missed
  const keyValueRegex = /\b(key|token|password|secret|pwd)\s*=\s*([^\s"'`]{8,})/gi;
  let kv: RegExpExecArray | null;
  while ((kv = keyValueRegex.exec(text)) !== null) {
    const value = kv[2];
    if (!value.includes("[") && !/redacted/i.test(value)) {
      warnings.add(`Suspicious ${kv[1]}=… value detected (not redacted)`);
    }
  }

  const bearerRegex = /Bearer\s+([A-Za-z0-9\-._~+/]{20,})/g;
  let bearer: RegExpExecArray | null;
  while ((bearer = bearerRegex.exec(text)) !== null) {
    const token = bearer[1];
    if (!token.includes("[") && !/redacted/i.test(token)) {
      warnings.add("Potential Bearer token present (not redacted)");
    }
  }

  if (/-----BEGIN [^-]*PRIVATE KEY-----/.test(text)) {
    warnings.add("PEM private key block detected (BEGIN PRIVATE KEY)");
  }

  const longBase64Regex = /(?:^|[^A-Za-z0-9+/])([A-Za-z0-9+/]{40,}={0,2})(?![A-Za-z0-9+/])/g;
  let b64: RegExpExecArray | null;
  while ((b64 = longBase64Regex.exec(text)) !== null) {
    const candidate = b64[1];
    if (!candidate.includes("[") && !/redacted/i.test(candidate)) {
      warnings.add("Long base64-like string found (40+ chars) – possible secret");
    }
  }

  const warningsList = Array.from(warnings);
  return { containsPotentialSecrets: warningsList.length > 0, warnings: warningsList };
}
