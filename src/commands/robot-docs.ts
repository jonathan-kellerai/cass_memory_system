/**
 * robot-docs command — machine-readable CLI documentation for agents
 *
 * Topics:
 *   guide       Agent orientation guide (quickstart for integrators)
 *   commands    Full command + flag inventory
 *   examples    Workflow examples (copy-paste ready)
 *   exit-codes  Exit code reference
 *   schemas     JSON Schema for core command outputs
 *
 * Always outputs JSON. The --json flag is accepted for consistency but
 * has no effect (output is always JSON).
 */

import { getCliName, getVersion, printJsonResult } from "../utils.js";

const SCHEMA_VERSION = "1";

// ── Guide ────────────────────────────────────────────────────────────────────

function getGuide(cli: string) {
  return {
    title: "cass-memory agent integration guide",
    summary: "Procedural memory system — captures coding patterns from AI sessions and surfaces them as actionable rules.",
    agentWorkflow: {
      step1: {
        action: "query context before non-trivial tasks",
        command: `${cli} context "<task>" --json`,
        returns: ["relevantBullets", "antiPatterns", "historySnippets", "suggestedCassQueries"],
      },
      step2: {
        action: "follow rules; leave inline feedback in comments",
        format: {
          helpful: "// [cass: helpful <id>] - reason",
          harmful: "// [cass: harmful <id>] - reason",
        },
      },
      step3: {
        action: "record session outcome",
        command: `${cli} outcome success b-id1,b-id2 --session /path/to/session.jsonl --json`,
      },
    },
    expectations: {
      degradedMode: "If cass is unavailable, historySnippets may be empty. System still returns rules. Run `cm doctor` to diagnose.",
      privacy: "Cross-agent enrichment is opt-in and off by default. Check `cm privacy status`.",
      remoteHistory: "historySnippets[].origin.kind is 'local' or 'remote'. Filter as needed.",
    },
    operatorSetup: {
      schedule: `${cli} reflect --days 7 --json  # run via cron or hook after sessions`,
      health: `${cli} doctor --json              # diagnose issues`,
      init: `${cli} init                         # first-time setup`,
    },
    doNotDo: [
      "Run reflect manually inside an agent session (schedule it externally)",
      "Add rules to the playbook during a task (let reflection do it)",
      "Worry about the learning pipeline — it's automated once reflect is scheduled",
    ],
  };
}

// ── Commands ─────────────────────────────────────────────────────────────────

interface FlagDef { flag: string; description: string; default?: string | number | boolean }
interface CommandDef {
  name: string;
  aliases?: string[];
  group: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required: boolean }>;
  flags: FlagDef[];
  examples: string[];
}

function getCommands(cli: string): CommandDef[] {
  return [
    {
      name: "context",
      aliases: ["ctx"],
      group: "agent",
      description: "Get relevant rules and history for a task. Primary agent entry point.",
      arguments: [{ name: "task", description: "Description of the task to perform", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON (recommended for agents)" },
        { flag: "--limit <n>", description: "Max rules to return", default: 50 },
        { flag: "--history <n>", description: "Max history snippets", default: 10 },
        { flag: "--days <n>", description: "History lookback window (days)", default: 90 },
        { flag: "--workspace <path>", description: "Filter rules/history by workspace path" },
        { flag: "--format <markdown|json|toon>", description: "Force output format; toon is token-efficient" },
        { flag: "--stats", description: "Print token stats (JSON vs TOON) to stderr" },
        { flag: "--log-context", description: "Log context usage for implicit feedback" },
        { flag: "--session <id>", description: "Session id to associate with context log" },
      ],
      examples: [
        `${cli} context "implement JWT authentication" --json`,
        `${cli} context "fix memory leak" --limit 10 --days 30 --json`,
        `${cli} context "write tests" --format toon --stats`,
      ],
    },
    {
      name: "quickstart",
      group: "agent",
      description: "Self-documentation — explains the system to an agent.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
      ],
      examples: [`${cli} quickstart --json`],
    },
    {
      name: "robot-docs",
      group: "agent",
      description: "Machine-readable CLI documentation (this command).",
      arguments: [{ name: "topic", description: "guide | commands | examples | exit-codes | schemas", required: false }],
      flags: [
        { flag: "--json / -j", description: "Output JSON (always on for this command)" },
      ],
      examples: [
        `${cli} robot-docs --json`,
        `${cli} robot-docs guide --json`,
        `${cli} robot-docs commands --json`,
        `${cli} robot-docs schemas --json`,
        `${cli} --schema`,
      ],
    },
    {
      name: "similar",
      group: "agent",
      description: "Find playbook bullets similar to a query string.",
      arguments: [{ name: "query", description: "Query text to match", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--limit <n>", description: "Number of results", default: 5 },
        { flag: "--threshold <t>", description: "Minimum similarity score 0–1", default: 0.7 },
        { flag: "--scope <global|workspace|all>", description: "Scope filter", default: "all" },
        { flag: "--format <json|toon>", description: "Output format" },
        { flag: "--stats", description: "Print token stats to stderr" },
      ],
      examples: [
        `${cli} similar "jwt authentication errors" --json`,
        `${cli} similar "rate limit handling" --limit 10 --threshold 0.8 --json`,
      ],
    },
    {
      name: "outcome",
      group: "agent",
      description: "Record implicit feedback from session outcome for shown rules.",
      arguments: [
        { name: "status", description: "success | failure | mixed | partial", required: true },
        { name: "rules", description: "Comma-separated rule IDs that were shown", required: true },
      ],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--session <path>", description: "Session file path for provenance" },
        { flag: "--duration <seconds>", description: "Task duration in seconds" },
        { flag: "--errors <count>", description: "Number of errors encountered" },
        { flag: "--retries", description: "Whether there were retries" },
        { flag: "--sentiment <positive|negative|neutral>", description: "Explicit sentiment override" },
        { flag: "--text <text>", description: "Session notes for auto-detected sentiment" },
      ],
      examples: [
        `${cli} outcome success b-abc123,b-def456 --session /path/to/session.jsonl --duration 600 --json`,
        `${cli} outcome failure b-abc123 --errors 3 --text "kept timing out" --json`,
      ],
    },
    {
      name: "mark",
      group: "agent",
      description: "Record explicit helpful/harmful feedback for a rule.",
      arguments: [{ name: "bulletId", description: "Rule ID (e.g. b-abc123)", required: true }],
      flags: [
        { flag: "--helpful", description: "Mark as helpful" },
        { flag: "--harmful", description: "Mark as harmful" },
        { flag: "--reason <reason>", description: "Reason: caused_bug | wasted_time | contradicted_requirements | wrong_context | outdated | other" },
        { flag: "--session <path>", description: "Associated session path" },
        { flag: "--json / -j", description: "Output JSON" },
      ],
      examples: [
        `${cli} mark b-abc123 --helpful --json`,
        `${cli} mark b-abc123 --harmful --reason caused_bug --json`,
      ],
    },
    {
      name: "init",
      group: "operator",
      description: "Initialize configuration and playbook.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "-f, --force", description: "Reinitialize (creates backups)" },
        { flag: "--yes", description: "Confirm overwrite without prompt" },
        { flag: "--repo", description: "Initialize repo-level .cass/ directory" },
        { flag: "--starter <name>", description: "Seed with a starter ruleset (e.g. typescript, python)" },
        { flag: "--no-interactive", description: "Disable interactive prompts" },
      ],
      examples: [
        `${cli} init`,
        `${cli} init --starter typescript`,
        `${cli} init --force --yes --json`,
      ],
    },
    {
      name: "doctor",
      aliases: ["dr"],
      group: "operator",
      description: "Check system health and optionally fix issues.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--fix", description: "Auto-fix detected issues" },
        { flag: "--format <json|toon>", description: "Output format" },
      ],
      examples: [
        `${cli} doctor --json`,
        `${cli} doctor --fix`,
      ],
    },
    {
      name: "reflect",
      aliases: ["ref"],
      group: "operator",
      description: "Process recent sessions to extract new rules. Schedule externally (cron/hook).",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--days <n>", description: "Lookback window (days)", default: 7 },
        { flag: "--session <path>", description: "Process a specific session file" },
        { flag: "--dry-run", description: "Preview changes without applying" },
        { flag: "--auto", description: "Non-interactive mode" },
        { flag: "--limit <n>", description: "Max sessions to process" },
      ],
      examples: [
        `${cli} reflect --days 7 --json`,
        `${cli} reflect --dry-run --json`,
      ],
    },
    {
      name: "stats",
      group: "operator",
      description: "Show playbook health metrics.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--format <json|toon>", description: "Output format" },
        { flag: "--stats", description: "Print token stats to stderr" },
      ],
      examples: [
        `${cli} stats --json`,
        `${cli} stats --format toon`,
      ],
    },
    {
      name: "playbook",
      group: "operator",
      description: "Manage playbook rules (subcommands: list, add, get, remove, export, import, deprecate, conflicts).",
      flags: [],
      examples: [
        `${cli} playbook list --json`,
        `${cli} playbook list --category testing --json`,
        `${cli} playbook add "Always validate input" --category security --json`,
        `${cli} playbook get b-abc123 --json`,
        `${cli} playbook export --json > backup.json`,
        `${cli} playbook import backup.json --replace --json`,
      ],
    },
    {
      name: "top",
      group: "operator",
      description: "Show most effective playbook bullets.",
      arguments: [{ name: "count", description: "Number of results", required: false }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--helpful", description: "Sort by helpful count" },
        { flag: "--harmful", description: "Sort by harmful count" },
        { flag: "--category <cat>", description: "Filter by category" },
        { flag: "--format <json|toon>", description: "Output format" },
      ],
      examples: [
        `${cli} top 20 --json`,
        `${cli} top --harmful --limit 10 --json`,
      ],
    },
    {
      name: "stale",
      group: "operator",
      description: "Find bullets without recent feedback.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--days <n>", description: "Stale threshold (days)", default: 90 },
        { flag: "--category <cat>", description: "Filter by category" },
      ],
      examples: [
        `${cli} stale --days 180 --json`,
      ],
    },
    {
      name: "validate",
      group: "operator",
      description: "Validate a proposed rule against session history.",
      arguments: [{ name: "rule", description: "Rule text or bullet ID to validate", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--days <n>", description: "History lookback (days)", default: 90 },
      ],
      examples: [
        `${cli} validate "Always use parameterized queries" --json`,
        `${cli} validate b-abc123 --json`,
      ],
    },
    {
      name: "forget",
      group: "operator",
      description: "Deprecate a rule and optionally create an inverted anti-pattern.",
      arguments: [{ name: "bulletId", description: "Rule ID", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--reason <text>", description: "Reason for deprecation (required)" },
        { flag: "--invert", description: "Create inverted anti-pattern" },
      ],
      examples: [
        `${cli} forget b-abc123 --reason "Superseded" --json`,
        `${cli} forget b-abc123 --reason "Bad advice" --invert --json`,
      ],
    },
    {
      name: "onboard",
      group: "operator",
      description: "Agent-native guided onboarding (subcommands: status, gaps, sample, read, reset).",
      flags: [],
      examples: [
        `${cli} onboard status --json`,
        `${cli} onboard gaps --json`,
        `${cli} onboard sample --fill-gaps --json`,
        `${cli} onboard read /path/to/session.jsonl --json`,
      ],
    },
    {
      name: "project",
      group: "operator",
      description: "Export playbook for project documentation.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--format <fmt>", description: "agents.md | claude.md | raw | yaml | json", default: "agents.md" },
        { flag: "--output <path>", description: "Write to file instead of stdout" },
        { flag: "--force", description: "Overwrite existing output file" },
        { flag: "--per-category <n>", description: "Limit rules per category" },
      ],
      examples: [
        `${cli} project --format agents.md --output AGENTS.md`,
        `${cli} project --format claude.md --output CLAUDE.md`,
      ],
    },
    {
      name: "audit",
      group: "advanced",
      description: "Audit recent sessions against playbook rules.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--days <n>", description: "Lookback days" },
        { flag: "--trauma", description: "Scan for catastrophic patterns (Project Hot Stove)" },
      ],
      examples: [
        `${cli} audit --days 30 --json`,
        `${cli} audit --trauma --json`,
      ],
    },
    {
      name: "serve",
      group: "advanced",
      description: "Run HTTP MCP server for agent integration via Archangel gateway.",
      flags: [
        { flag: "--port <n>", description: "Port to listen on", default: 8765 },
        { flag: "--host <host>", description: "Host to bind", default: "127.0.0.1" },
      ],
      examples: [
        `${cli} serve`,
        `${cli} serve --host 127.0.0.1 --port 8765`,
      ],
    },
    {
      name: "outcome-apply",
      group: "advanced",
      description: "Apply recorded outcomes to playbook feedback (implicit marks).",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--session <id>", description: "Apply only outcomes for this session id" },
        { flag: "--limit <n>", description: "Max outcomes to load", default: 50 },
      ],
      examples: [`${cli} outcome-apply --json`],
    },
    {
      name: "why",
      group: "advanced",
      description: "Show bullet origin evidence and reasoning.",
      arguments: [{ name: "bulletId", description: "Rule ID", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
      ],
      examples: [`${cli} why b-abc123 --json`],
    },
    {
      name: "undo",
      group: "advanced",
      description: "Revert bad curation decisions (un-deprecate, undo feedback, delete).",
      arguments: [{ name: "bulletId", description: "Rule ID", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--delete", description: "Permanently delete the bullet" },
        { flag: "--yes", description: "Skip confirmation" },
      ],
      examples: [`${cli} undo b-abc123 --json`],
    },
    {
      name: "usage",
      group: "advanced",
      description: "Show LLM cost and usage statistics.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--days <n>", description: "Lookback days" },
      ],
      examples: [`${cli} usage --json`],
    },
    {
      name: "privacy",
      group: "advanced",
      description: "Privacy controls for cross-agent enrichment (subcommands: status, enable, disable, allow, deny).",
      flags: [],
      examples: [
        `${cli} privacy status --json`,
        `${cli} privacy enable --json`,
        `${cli} privacy deny cursor --json`,
      ],
    },
    {
      name: "guard",
      group: "advanced",
      description: "Manage mechanical safety guards (Project Hot Stove).",
      flags: [
        { flag: "--install", description: "Install trauma guard hook to .claude/hooks" },
        { flag: "--git", description: "Install git pre-commit hook" },
        { flag: "--json / -j", description: "Output JSON" },
      ],
      examples: [`${cli} guard --install --json`],
    },
    {
      name: "trauma",
      group: "advanced",
      description: "Manage Project Hot Stove traumas/scars (subcommands: list, add, heal, remove, import).",
      flags: [],
      examples: [
        `${cli} trauma list --json`,
        `${cli} trauma add "^rm -rf" --severity FATAL`,
        `${cli} trauma heal trauma-abc123 --json`,
      ],
    },
    {
      name: "diary",
      group: "advanced",
      description: "Generate a structured diary from a coding session file.",
      arguments: [{ name: "session", description: "Path to session JSONL file", required: true }],
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
        { flag: "--save", description: "Save to diary directory instead of printing" },
        { flag: "--raw", description: "Skip cass export, use raw file" },
      ],
      examples: [`${cli} diary /path/to/session.jsonl --json`],
    },
    {
      name: "starters",
      group: "operator",
      description: "List available starter playbooks.",
      flags: [
        { flag: "--json / -j", description: "Output JSON" },
      ],
      examples: [`${cli} starters --json`],
    },
  ];
}

// ── Examples ──────────────────────────────────────────────────────────────────

function getExamples(cli: string) {
  return {
    agentSession: {
      description: "Typical agent session — context at start, outcome at end",
      steps: [
        `${cli} context "implement JWT authentication with refresh tokens" --json`,
        `# ... implement the feature, referencing rule IDs in comments ...`,
        `# [cass: helpful b-abc123] - this caching pattern saved 30 minutes`,
        `${cli} outcome success b-abc123,b-def456 --session /path/to/session.jsonl --json`,
      ],
    },
    operatorSetup: {
      description: "First-time operator setup",
      steps: [
        `${cli} init`,
        `${cli} doctor --json`,
        `${cli} starters --json  # browse available starter rulesets`,
        `${cli} init --starter typescript  # seed with language-specific rules`,
      ],
    },
    operatorMaintenance: {
      description: "Ongoing operator maintenance",
      steps: [
        `${cli} reflect --days 7 --json  # extract rules from recent sessions`,
        `${cli} stats --json             # check playbook health`,
        `${cli} stale --days 90 --json   # find unused rules`,
        `${cli} top 20 --json            # review most effective rules`,
        `${cli} doctor --fix             # auto-fix detected issues`,
      ],
    },
    playbookManagement: {
      description: "Curate the playbook manually",
      steps: [
        `${cli} playbook list --category security --json`,
        `${cli} playbook add "Always use parameterized queries" --category security --json`,
        `${cli} validate b-abc123 --json`,
        `${cli} forget b-abc123 --reason "Superseded by b-new123" --json`,
        `${cli} playbook export --json > backup.json`,
      ],
    },
    agentNativeOnboarding: {
      description: "Populate playbook from session history (no API cost)",
      steps: [
        `${cli} onboard status --json`,
        `${cli} onboard gaps --json                    # see underrepresented categories`,
        `${cli} onboard sample --fill-gaps --json      # get sessions to analyze`,
        `${cli} onboard read /path/to/session.jsonl --json`,
        `${cli} playbook add "extracted rule text" --category debugging --json`,
      ],
    },
    tokenOptimized: {
      description: "Token-efficient output (toon format)",
      steps: [
        `${cli} context "implement caching" --format toon --stats`,
        `${cli} playbook list --format toon`,
        `${cli} stats --format toon`,
      ],
    },
    machineReadableDocs: {
      description: "Discover capabilities programmatically",
      steps: [
        `${cli} quickstart --json`,
        `${cli} robot-docs guide --json`,
        `${cli} robot-docs commands --json`,
        `${cli} --schema`,
      ],
    },
  };
}

// ── Exit Codes ────────────────────────────────────────────────────────────────

function getExitCodes() {
  return {
    description: "All commands exit with 0 on success. Non-zero codes indicate specific failure categories.",
    codes: [
      { code: 0, name: "SUCCESS", description: "Command completed successfully." },
      { code: 1, name: "GENERAL_ERROR", description: "Unhandled internal error. Check stderr for details." },
      { code: 2, name: "INVALID_INPUT", description: "Bad arguments, unknown flags, or invalid option values." },
      { code: 3, name: "CONFIG_INVALID", description: "Configuration file is missing, malformed, or unreadable." },
      { code: 4, name: "PLAYBOOK_EMPTY", description: "Playbook has no active rules (relevant for context/stats)." },
      { code: 5, name: "CASS_SEARCH_FAILED", description: "cass binary unavailable or returned an error." },
      { code: 6, name: "LLM_API_ERROR", description: "LLM provider error during reflect or validate." },
      { code: 7, name: "FILE_NOT_FOUND", description: "A required input file was not found." },
      { code: 8, name: "FILE_WRITE_FAILED", description: "Could not write output file." },
      { code: 9, name: "NETWORK_ERROR", description: "Network request failed (remote cass, LLM API)." },
      { code: 10, name: "LOCK_FAILED", description: "Could not acquire file lock (concurrent processes)." },
      { code: 11, name: "INTERNAL_ERROR", description: "Internal consistency error; likely a bug." },
    ],
    note: "Soft-success (command ran but had no effect) still exits 0 with `effect: false` in JSON output.",
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

function getSchemas(version: string) {
  const envelope = (dataRef: string) => ({
    type: "object",
    required: ["success", "command", "timestamp", "data", "metadata"],
    properties: {
      success: { type: "boolean", enum: [true] },
      command: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
      data: { $ref: dataRef },
      metadata: {
        type: "object",
        required: ["executionMs", "version"],
        properties: {
          executionMs: { type: "number" },
          version: { type: "string" },
        },
      },
      effect: { type: "boolean" },
      reason: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
    },
  });

  const bulletBase = {
    type: "object",
    required: ["id", "category", "content", "scope", "state", "maturity", "helpfulCount", "harmfulCount", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string", description: "Unique rule ID, e.g. b-abc123" },
      category: { type: "string", description: "Category: debugging, testing, architecture, workflow, security, performance, git, integration, etc." },
      content: { type: "string", description: "Rule text in imperative form" },
      scope: { type: "string", enum: ["global", "workspace", "language", "framework", "task"] },
      scopeKey: { type: "string" },
      workspace: { type: "string" },
      type: { type: "string", enum: ["rule", "anti-pattern"] },
      isNegative: { type: "boolean" },
      state: { type: "string", enum: ["draft", "active", "retired"] },
      maturity: { type: "string", enum: ["candidate", "established", "proven", "deprecated"] },
      helpfulCount: { type: "number" },
      harmfulCount: { type: "number" },
      effectiveScore: { type: "number" },
      pinned: { type: "boolean" },
      deprecated: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  };

  const scoredBullet = {
    allOf: [
      { $ref: "#/$defs/bullet" },
      {
        type: "object",
        required: ["relevanceScore", "effectiveScore"],
        properties: {
          relevanceScore: { type: "number", minimum: 0, maximum: 1 },
          effectiveScore: { type: "number" },
          finalScore: { type: "number" },
          lastHelpful: { type: "string", format: "date-time" },
        },
      },
    ],
  };

  const cassHit = {
    type: "object",
    required: ["source_path", "line_number", "agent", "snippet"],
    properties: {
      source_path: { type: "string", description: "Path to the session JSONL file" },
      sessionPath: { type: "string", description: "Alias for source_path" },
      line_number: { type: "number" },
      agent: { type: "string", description: "Agent that produced the session, e.g. claude, cursor, codex" },
      workspace: { type: "string" },
      title: { type: "string" },
      snippet: { type: "string", description: "Matching text excerpt from the session" },
      score: { type: "number" },
      timestamp: { type: "string" },
      origin: {
        type: "object",
        required: ["kind"],
        properties: {
          kind: { type: "string", enum: ["local", "remote"] },
          host: { type: "string" },
        },
      },
    },
  };

  const degradedCass = {
    type: "object",
    required: ["available", "reason"],
    properties: {
      available: { type: "boolean" },
      reason: { type: "string", enum: ["NOT_FOUND", "INDEX_MISSING", "FTS_TABLE_MISSING", "TIMEOUT", "OTHER"] },
      message: { type: "string" },
      suggestedFix: { type: "array", items: { type: "string" } },
    },
  };

  const contextData = {
    type: "object",
    required: ["task", "relevantBullets", "antiPatterns", "historySnippets", "deprecatedWarnings", "suggestedCassQueries"],
    properties: {
      task: { type: "string", description: "The task string passed to the command" },
      relevantBullets: {
        type: "array",
        items: { $ref: "#/$defs/scoredBullet" },
        description: "Rules relevant to the task, sorted by score descending",
      },
      antiPatterns: {
        type: "array",
        items: { $ref: "#/$defs/scoredBullet" },
        description: "Anti-patterns and pitfalls to avoid",
      },
      historySnippets: {
        type: "array",
        items: { $ref: "#/$defs/cassHit" },
        description: "Past session excerpts that solved similar problems",
      },
      deprecatedWarnings: {
        type: "array",
        items: { type: "string" },
        description: "Warnings about deprecated rules that were shown",
      },
      suggestedCassQueries: {
        type: "array",
        items: { type: "string" },
        description: "Suggested search queries for deeper investigation",
      },
      degraded: {
        type: "object",
        description: "Present when cass or other subsystems are unavailable",
        properties: {
          cass: { $ref: "#/$defs/degradedCass" },
          remoteCass: {
            type: "array",
            items: {
              allOf: [
                { $ref: "#/$defs/degradedCass" },
                { type: "object", properties: { host: { type: "string" } } },
              ],
            },
          },
        },
      },
      traumaWarning: {
        type: "object",
        description: "Present when the task matches a Project Hot Stove trauma pattern",
        required: ["pattern", "reason", "reference"],
        properties: {
          pattern: { type: "string" },
          reason: { type: "string" },
          reference: { type: "string" },
        },
      },
    },
  };

  const quickstartData = {
    type: "object",
    required: ["summary", "oneCommand", "protocol", "examples"],
    properties: {
      summary: { type: "string" },
      oneCommand: { type: "string" },
      expectations: { type: "object" },
      whatItReturns: { type: "array", items: { type: "string" } },
      doNotDo: { type: "array", items: { type: "string" } },
      operatorNote: { type: "object" },
      soloUser: { type: "object" },
      inlineFeedbackFormat: { type: "object", properties: { helpful: { type: "string" }, harmful: { type: "string" } } },
      protocol: { type: "object" },
      examples: { type: "array", items: { type: "string" } },
    },
  };

  const onboardStatusData = {
    type: "object",
    properties: {
      sessionsIndexed: { type: "number" },
      sessionsOnboarded: { type: "number" },
      rulesExtracted: { type: "number" },
      categories: { type: "object", additionalProperties: { type: "number" } },
      gaps: { type: "array", items: { type: "string" } },
      nextStep: { type: "string" },
    },
  };

  const playbookAddData = {
    type: "object",
    required: ["added"],
    properties: {
      added: { type: "array", items: { $ref: "#/$defs/bullet" } },
      skipped: { type: "number" },
      warnings: { type: "array", items: { type: "string" } },
    },
  };

  return {
    $schema: "https://json-schema.org/draft-07/schema",
    schema_version: SCHEMA_VERSION,
    version: version,
    description: "JSON Schema definitions for cm command outputs. Each key is a command name.",
    $defs: {
      bullet: bulletBase,
      scoredBullet,
      cassHit,
      degradedCass,
    },
    commands: {
      context: {
        description: "Output of `cm context \"<task>\" --json`",
        schema: {
          ...envelope("#/$defs/contextData"),
          $defs: { contextData },
        },
      },
      quickstart: {
        description: "Output of `cm quickstart --json`",
        schema: {
          ...envelope("#/$defs/quickstartData"),
          $defs: { quickstartData },
        },
      },
      "onboard-status": {
        description: "Output of `cm onboard status --json`",
        schema: {
          ...envelope("#/$defs/onboardStatusData"),
          $defs: { onboardStatusData },
        },
      },
      "playbook-add": {
        description: "Output of `cm playbook add \"<rule>\" --json`",
        schema: {
          ...envelope("#/$defs/playbookAddData"),
          $defs: { playbookAddData },
        },
      },
    },
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export type RobotDocsTopic = "guide" | "commands" | "examples" | "exit-codes" | "schemas";

const VALID_TOPICS: RobotDocsTopic[] = ["guide", "commands", "examples", "exit-codes", "schemas"];

export async function robotDocsCommand(opts: { topic?: string; json?: boolean }) {
  const startedAtMs = Date.now();
  const cli = getCliName();
  const version = getVersion();
  const raw = (opts.topic ?? "guide").toLowerCase().trim();
  const topic = (VALID_TOPICS.includes(raw as RobotDocsTopic) ? raw : "guide") as RobotDocsTopic;

  let data: unknown;
  switch (topic) {
    case "guide":
      data = getGuide(cli);
      break;
    case "commands":
      data = { commands: getCommands(cli) };
      break;
    case "examples":
      data = { examples: getExamples(cli) };
      break;
    case "exit-codes":
      data = getExitCodes();
      break;
    case "schemas":
      data = getSchemas(version);
      break;
  }

  printJsonResult("robot-docs", { topic, ...data as object }, {
    startedAtMs,
  });
}
