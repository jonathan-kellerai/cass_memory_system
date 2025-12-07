export const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // AWS
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[AWS_ACCESS_KEY]" },
  { pattern: /[A-Za-z0-9/+=]{40}(?=\s|$|"|')/g, replacement: "[AWS_SECRET_KEY]" },

  // Generic API keys/tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g, replacement: "[BEARER_TOKEN]" },
  { pattern: /api[_-]?key["\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[API_KEY]" },
  { pattern: /token["\s:=]+["']?[A-Za-z0-9\-_]{20,}["']?/gi, replacement: "[TOKEN]" },

  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: "[PRIVATE_KEY]" },

  // Passwords in common formats
  { pattern: /password["\s:=]+["'][^"']{8,}["']/gi, replacement: 'password="[REDACTED]"' },

  // GitHub tokens
  { pattern: /ghp_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_PAT]" },
  { pattern: /github_pat_[A-Za-z0-9_]{22,}/g, replacement: "[GITHUB_PAT]" },

  // Slack tokens
  { pattern: /xox[baprs]-[A-Za-z0-9-]+/g, replacement: "[SLACK_TOKEN]" },

  // Database URLs with credentials
  { pattern: /(postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/gi, replacement: "$1://[USER]:[PASS]@" }
];

export function sanitize(
  text: string,
  config: { enabled: boolean; extraPatterns?: RegExp[] }
): string {
  if (!config.enabled) {
    return text;
  }

  let sanitized = text;

  // Apply default patterns
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Apply extra patterns
  if (config.extraPatterns) {
    for (const pattern of config.extraPatterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }
  }

  return sanitized;
}