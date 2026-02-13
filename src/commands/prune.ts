/**
 * prune command - Bulk-remove bullets matching criteria
 *
 * Removes deprecated bullets, stale zero-feedback candidates, and bullets
 * matching a content prefix. Designed for playbook hygiene — reducing bloat
 * from noise bullets that accumulate without curation.
 */
import { loadConfig } from "../config.js";
import { loadPlaybook, savePlaybook } from "../playbook.js";
import {
  confirmDangerousAction,
  expandPath,
  getCliName,
  printJsonResult,
  reportError,
  validatePositiveInt,
} from "../utils.js";
import { ErrorCode, PlaybookBullet } from "../types.js";
import chalk from "chalk";
import fs from "node:fs/promises";
import { formatRule, getOutputStyle } from "../output.js";

export interface PruneFlags {
  deprecated?: boolean;
  staleDays?: number;
  contentPrefix?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
}

interface PruneCandidate {
  id: string;
  content: string;
  category: string;
  maturity: string;
  reason: string;
}

function daysSinceCreation(bullet: PlaybookBullet): number {
  const created = new Date(bullet.createdAt);
  const diffMs = Date.now() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function matchesPruneCriteria(
  bullet: PlaybookBullet,
  flags: PruneFlags,
): { matches: boolean; reason: string } {
  if (flags.deprecated && bullet.deprecated) {
    return { matches: true, reason: "deprecated" };
  }

  if (
    flags.staleDays != null &&
    bullet.helpfulCount === 0 &&
    bullet.harmfulCount === 0
  ) {
    const age = daysSinceCreation(bullet);
    if (age > flags.staleDays) {
      return { matches: true, reason: `stale zero-feedback (${age}d old)` };
    }
  }

  if (flags.contentPrefix && bullet.content.startsWith(flags.contentPrefix)) {
    return { matches: true, reason: `content prefix "${flags.contentPrefix}"` };
  }

  return { matches: false, reason: "" };
}

export async function pruneCommand(flags: PruneFlags = {}): Promise<void> {
  const startedAtMs = Date.now();
  const command = "prune";
  const cli = getCliName();

  // Validate: at least one filter must be specified
  if (!flags.deprecated && flags.staleDays == null && !flags.contentPrefix) {
    reportError("At least one filter is required: --deprecated, --stale-days, or --content-prefix", {
      code: ErrorCode.MISSING_REQUIRED,
      details: { missing: "filter" },
      hint: `Example: ${cli} prune --deprecated --dry-run`,
      json: flags.json,
      command,
      startedAtMs,
    });
    return;
  }

  // Validate stale-days
  if (flags.staleDays != null) {
    const check = validatePositiveInt(flags.staleDays, "stale-days", { min: 1, allowUndefined: false });
    if (!check.ok) {
      reportError(check.message, {
        code: ErrorCode.INVALID_INPUT,
        details: check.details,
        hint: `Example: ${cli} prune --stale-days 30 --dry-run`,
        json: flags.json,
        command,
        startedAtMs,
      });
      return;
    }
  }

  const config = await loadConfig();
  const playbookPath = expandPath(config.playbookPath);
  const playbook = await loadPlaybook(playbookPath);

  // Find all bullets matching any of the criteria
  const candidates: PruneCandidate[] = [];
  for (const bullet of playbook.bullets) {
    const { matches, reason } = matchesPruneCriteria(bullet, flags);
    if (matches) {
      candidates.push({
        id: bullet.id,
        content: bullet.content.slice(0, 120),
        category: bullet.category || "uncategorized",
        maturity: bullet.maturity || "candidate",
        reason,
      });
    }
  }

  if (candidates.length === 0) {
    if (flags.json) {
      printJsonResult(command, {
        removed: 0,
        totalBefore: playbook.bullets.length,
        totalAfter: playbook.bullets.length,
        dryRun: Boolean(flags.dryRun),
        candidates: [],
      }, { startedAtMs });
    } else {
      console.log(chalk.green("No bullets match the specified criteria."));
    }
    return;
  }

  // Dry run — just report
  if (flags.dryRun) {
    if (flags.json) {
      printJsonResult(command, {
        removed: candidates.length,
        totalBefore: playbook.bullets.length,
        totalAfter: playbook.bullets.length - candidates.length,
        dryRun: true,
        candidates,
      }, { startedAtMs });
    } else {
      printDryRunSummary(candidates, playbook.bullets.length, flags, cli);
    }
    return;
  }

  // Confirm before destructive operation
  const confirmed = await confirmDangerousAction({
    action: `Permanently remove ${candidates.length} of ${playbook.bullets.length} bullets from the playbook`,
    details: [
      ...buildFilterDescription(flags),
      `A backup will be created before removal.`,
    ],
    confirmPhrase: "PRUNE",
    yes: flags.yes,
    json: flags.json,
  });

  if (!confirmed) {
    if (flags.json) {
      reportError("Pruning cancelled by user", {
        code: ErrorCode.INVALID_INPUT,
        json: true,
        command,
        startedAtMs,
      });
    } else {
      console.log(chalk.yellow("Pruning cancelled."));
    }
    return;
  }

  // Create backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${playbookPath}.backup.${timestamp}`;
  await fs.copyFile(playbookPath, backupPath);

  // Remove matching bullets
  const removeIds = new Set(candidates.map((c) => c.id));
  playbook.bullets = playbook.bullets.filter((b) => !removeIds.has(b.id));

  await savePlaybook(playbook, playbookPath);

  if (flags.json) {
    printJsonResult(command, {
      removed: candidates.length,
      totalBefore: candidates.length + playbook.bullets.length,
      totalAfter: playbook.bullets.length,
      dryRun: false,
      backupPath,
      candidates,
    }, { startedAtMs });
  } else {
    console.log(chalk.green(`Removed ${candidates.length} bullets.`));
    console.log(chalk.dim(`Playbook: ${playbook.bullets.length} bullets remaining.`));
    console.log(chalk.dim(`Backup: ${backupPath}`));
  }
}

function buildFilterDescription(flags: PruneFlags): string[] {
  const desc: string[] = [];
  if (flags.deprecated) desc.push("Deprecated bullets");
  if (flags.staleDays != null) desc.push(`Stale candidates (>${flags.staleDays}d, 0 feedback)`);
  if (flags.contentPrefix) desc.push(`Content starting with "${flags.contentPrefix}"`);
  return desc;
}

function printDryRunSummary(
  candidates: PruneCandidate[],
  totalBullets: number,
  flags: PruneFlags,
  cli: string,
): void {
  const style = getOutputStyle();
  const maxWidth = Math.min(style.width, 84);
  const divider = chalk.dim(formatRule("─", { maxWidth }));

  console.log(chalk.bold("PRUNE (dry run)"));
  console.log(divider);
  console.log(chalk.dim(`Would remove ${candidates.length} of ${totalBullets} bullets`));
  console.log(chalk.dim(`Filters: ${buildFilterDescription(flags).join(", ")}`));
  console.log("");

  // Group by reason
  const byReason = new Map<string, PruneCandidate[]>();
  for (const c of candidates) {
    const key = c.reason;
    if (!byReason.has(key)) byReason.set(key, []);
    byReason.get(key)!.push(c);
  }

  for (const [reason, items] of byReason) {
    console.log(chalk.yellow(`${reason} (${items.length}):`));
    const preview = items.slice(0, 5);
    for (const item of preview) {
      console.log(chalk.gray(`  [${item.id}] ${item.content.slice(0, 60)}...`));
    }
    if (items.length > 5) {
      console.log(chalk.gray(`  ... and ${items.length - 5} more`));
    }
    console.log("");
  }

  console.log(chalk.bold("To execute:"));
  const flagParts: string[] = [];
  if (flags.deprecated) flagParts.push("--deprecated");
  if (flags.staleDays != null) flagParts.push(`--stale-days ${flags.staleDays}`);
  if (flags.contentPrefix) flagParts.push(`--content-prefix "${flags.contentPrefix}"`);
  console.log(chalk.cyan(`  ${cli} prune ${flagParts.join(" ")} --yes`));
}
