# cass-memory

![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue.svg)
![Runtime](https://img.shields.io/badge/runtime-Bun-f472b6.svg)
![Status](https://img.shields.io/badge/status-alpha-purple.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Procedural memory for AI coding agents.**
Transforms scattered agent sessions into persistent, cross-agent memory—so every agent learns from every other agent's experience.

<div align="center">

```bash
# One-liner install (Linux/macOS)
curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/cass_memory_system/main/install.sh \
  | bash -s -- --easy-mode --verify
```

</div>

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EPISODIC MEMORY (cass)                           │
│   Raw session logs from all agents — the "ground truth"             │
│   Claude Code │ Codex │ Cursor │ Aider │ Gemini │ ChatGPT │ ...    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ cass search
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    WORKING MEMORY (Diary)                           │
│   Structured session summaries bridging raw logs to rules           │
│   accomplishments │ decisions │ challenges │ outcomes               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ reflect + curate (automated)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PROCEDURAL MEMORY (Playbook)                     │
│   Distilled rules with confidence tracking                          │
│   Rules │ Anti-patterns │ Feedback │ Decay                          │
└─────────────────────────────────────────────────────────────────────┘
```

Every agent's sessions feed the shared memory. A pattern discovered in Cursor **automatically** helps Claude Code on the next session.

---

## For Agents: The One Command You Need

```bash
cm context "<your task>" --json
```

Before starting any non-trivial task, run this command. It returns:
- **Relevant rules** from the playbook (scored by task relevance)
- **Historical context** from past sessions (yours and other agents')
- **Anti-patterns** to avoid (things that have caused problems)
- **Suggested searches** for deeper investigation

### Example

```bash
cm context "fix the authentication timeout bug" --json
```

```json
{
  "task": "fix the authentication timeout bug",
  "relevantBullets": [
    {
      "id": "b-8f3a2c",
      "content": "Always check token expiry before other auth debugging",
      "effectiveScore": 8.5,
      "maturity": "proven"
    }
  ],
  "antiPatterns": [
    {
      "id": "b-x7k9p1",
      "content": "Don't cache auth tokens without expiry validation",
      "effectiveScore": 3.2
    }
  ],
  "historySnippets": [
    {
      "source_path": "~/.claude/sessions/session-001.jsonl",
      "agent": "claude",
      "snippet": "Fixed timeout by increasing token refresh interval..."
    }
  ],
  "suggestedCassQueries": [
    "cass search 'authentication timeout' --days 30"
  ]
}
```

### What NOT to Do

You do NOT need to:
- Run `cm reflect` (automation handles this)
- Run `cm mark` for feedback (use inline comments instead)
- Manually add rules to the playbook
- Worry about the learning pipeline

The system learns from your sessions automatically. Your job is just to query context before working.

### Inline Feedback (Optional)

When a rule helps or hurts during your work, leave inline feedback:

```typescript
// [cass: helpful b-8f3a2c] - this rule saved me from a rabbit hole
// [cass: harmful b-x7k9p1] - this advice was wrong for our use case
```

---

## Installation

### One-Liner (Recommended)

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/cass_memory_system/main/install.sh \
  | bash -s -- --easy-mode --verify
```

**Direct Downloads:**
- [Linux x64](https://github.com/Dicklesworthstone/cass_memory_system/releases/latest/download/cass-memory-linux-x64)
- [macOS Apple Silicon](https://github.com/Dicklesworthstone/cass_memory_system/releases/latest/download/cass-memory-macos-arm64)
- [macOS Intel](https://github.com/Dicklesworthstone/cass_memory_system/releases/latest/download/cass-memory-macos-x64)
- [Windows x64](https://github.com/Dicklesworthstone/cass_memory_system/releases/latest/download/cass-memory-windows-x64.exe)

### From Source

```bash
git clone https://github.com/Dicklesworthstone/cass_memory_system.git
cd cass_memory_system
bun install
bun run build
sudo mv ./dist/cass-memory /usr/local/bin/cm
```

### Verify Installation

```bash
cm --version
cm doctor --json
```

---

## Initial Setup

```bash
# Initialize (creates global config and playbook)
cm init

# Or with a starter playbook for common patterns
cm init --starter typescript  # or: react, python, go
cm starters  # list available starters
```

### Automating Reflection

Set up a cron job or hook:

```bash
# Daily reflection on recent sessions
cm reflect --days 7 --json

# Via cron (runs at 2am daily)
0 2 * * * /usr/local/bin/cm reflect --days 7 >> ~/.cass-memory/reflect.log 2>&1
```

For Claude Code users, add a post-session hook in `.claude/hooks.json`:
```json
{
  "post-session": ["cm reflect --days 1"]
}
```

---

## CLI Reference

### Agent Commands

| Command | Purpose |
|---------|---------|
| `cm context "<task>" --json` | Get relevant rules + history for a task |
| `cm quickstart --json` | Explain the system (self-documentation) |

### Playbook Commands

| Command | Purpose |
|---------|---------|
| `cm playbook list` | List active rules |
| `cm playbook get <id>` | Get detailed info for a rule |
| `cm playbook add "<content>"` | Add a new rule |
| `cm playbook remove <id>` | Deprecate a rule |
| `cm similar "<query>"` | Find bullets similar to a query |
| `cm top [N]` | Show N most effective bullets |
| `cm why <id>` | Show bullet origin evidence |
| `cm stats --json` | Playbook health metrics |

### Learning Commands

| Command | Purpose |
|---------|---------|
| `cm reflect --days N` | Process recent sessions into rules |
| `cm mark <id> --helpful\|--harmful` | Manual feedback |
| `cm outcome --status success\|failure\|mixed --rules <ids>` | Record session outcome |
| `cm validate "<rule>"` | Validate a proposed rule against history |
| `cm forget <id> --reason "<why>"` | Deprecate a rule permanently |
| `cm audit --days N` | Check sessions for rule violations |

### System Commands

| Command | Purpose |
|---------|---------|
| `cm init` | Initialize configuration and playbook |
| `cm doctor --fix` | Check system health, optionally fix issues |
| `cm project --format agents.md` | Export rules for AGENTS.md |
| `cm usage` | Show LLM cost and usage statistics |
| `cm serve --port N` | Run MCP server for agent integration |
| `cm privacy status` | Show cross-agent settings |

---

## AGENTS.md Integration

Add this to your project's `AGENTS.md`:

```markdown
## Memory System: cass-memory

Before starting complex tasks, retrieve relevant context:

\`\`\`bash
cm context "<task description>" --json
\`\`\`

This returns:
- **relevantBullets**: Rules that may help with your task
- **antiPatterns**: Pitfalls to avoid
- **historySnippets**: Past sessions that solved similar problems
- **suggestedCassQueries**: Searches for deeper investigation

### Protocol

1. **START**: Run `cm context "<task>" --json` before non-trivial work
2. **WORK**: Reference rule IDs when following them
3. **FEEDBACK**: Leave inline comments when rules help/hurt:
   - `// [cass: helpful b-xyz] - reason`
   - `// [cass: harmful b-xyz] - reason`
4. **END**: Just finish your work. Learning happens automatically.
```

---

## Configuration

Config lives at `~/.cass-memory/config.json` (global) and `.cass/config.json` (repo).

**Precedence:** CLI flags > Repo config > Global config > Defaults

### Key Settings

| Option | Default | Description |
|--------|---------|-------------|
| `provider` | `"anthropic"` | LLM provider: `anthropic`, `openai`, `google` |
| `model` | `"claude-sonnet-4-20250514"` | Model for reflection |
| `budget.dailyLimit` | `0.10` | Max daily LLM spend (USD) |
| `scoring.decayHalfLifeDays` | `90` | Days for feedback to decay |
| `scoring.harmfulMultiplier` | `4` | Weight harmful feedback N× more |
| `maxBulletsInContext` | `50` | Max rules in context |
| `crossAgent.enabled` | `false` | Enable cross-agent enrichment |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key for Anthropic (Claude) |
| `OPENAI_API_KEY` | API key for OpenAI |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key for Google Gemini |

---

## Architecture

### Confidence Decay

Rules aren't immortal. A rule helpful 8 times in January but never validated since loses confidence over time:

- **90-day half-life**: Confidence halves every 90 days without revalidation
- **4x harmful multiplier**: One mistake counts 4x as much as one success
- **Maturity progression**: candidate → established → proven

### Anti-Pattern Learning

Bad rules don't just get deleted—they become **warnings**:

```
"Cache auth tokens for performance"
    ↓ (3 harmful marks)
"PITFALL: Don't cache auth tokens without expiry validation"
```

### Graceful Degradation

| Condition | Behavior |
|-----------|----------|
| No cass | Playbook-only scoring, no history snippets |
| No playbook | Empty playbook, commands still work |
| No LLM | Deterministic reflection, no semantic enhancement |
| Offline | Cached playbook + local diary |

---

## MCP Server

Run cass-memory as an MCP server for programmatic agent integration:

```bash
cm serve --port 3001
```

**MCP config** (`~/.config/claude/mcp.json`):
```json
{
  "mcpServers": {
    "cm": {
      "command": "cm",
      "args": ["serve"]
    }
  }
}
```

---

## Directory Structure

```
~/.cass-memory/                  # Global (user-level)
├── config.json                  # User configuration
├── playbook.yaml                # Personal playbook
├── diary/                       # Session summaries
└── outcomes/                    # Session outcomes

.cass/                           # Project-level (in repo)
├── config.json                  # Project overrides
├── playbook.yaml                # Project-specific rules
└── blocked.yaml                 # Anti-patterns to block
```

---

## Privacy & Security

- **Local by default**: All data stays on your machine
- **Secret sanitization**: API keys, tokens, passwords auto-redacted
- **No telemetry**: Zero network calls except optional LLM
- **Cross-agent is opt-in**: Must explicitly enable in config

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `cass not found` | Install from [cass repo](https://github.com/Dicklesworthstone/coding_agent_session_search) |
| `API key missing` | Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |
| `Playbook corrupt` | Run `cm doctor --fix` |
| `Budget exceeded` | Check `cm usage`, adjust limits in config |

### Recovery

```bash
# Check system health
cm doctor --json

# Re-initialize if needed
cm init --force
```

---

## Development

```bash
git clone https://github.com/Dicklesworthstone/cass_memory_system.git
cd cass_memory_system
bun install

# Dev with hot reload
bun --watch run src/cm.ts <command>

# Tests
bun test
bun run test:watch

# Type check
bun run typecheck

# Build all platforms
bun run build:all
```

---

## License

MIT. See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- **[cass](https://github.com/Dicklesworthstone/coding_agent_session_search)** — The foundation that makes cross-agent search possible
- **ACE Paper** — The Agentic Context Engineering framework that inspired the pipeline design
