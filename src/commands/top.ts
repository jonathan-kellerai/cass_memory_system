/**
 * top command - Show most effective playbook bullets
 *
 * Quick command to see which rules are most effective based on
 * current scores with decay applied.
 */
import { loadConfig } from "../config.js";
import { loadMergedPlaybook, getActiveBullets } from "../playbook.js";
import { getEffectiveScore } from "../scoring.js";
import { formatLastHelpful, getCliName, printJsonResult } from "../utils.js";
import chalk from "chalk";
import { formatMaturityIcon, formatRule, formatTipPrefix, getOutputStyle, wrapText } from "../output.js";

export interface TopFlags {
  scope?: "global" | "workspace" | "all";
  category?: string;
  json?: boolean;
}

interface RankedBullet {
  rank: number;
  id: string;
  score: number;
  content: string;
  category: string;
  scope: string;
  maturity: string;
  feedback: { helpful: number; harmful: number };
  lastUsed: string;
}

export async function topCommand(
  count: number = 10,
  flags: TopFlags = {}
): Promise<void> {
  const config = await loadConfig();
  const playbook = await loadMergedPlaybook(config);

  let bullets = getActiveBullets(playbook);

  // Apply filters
  if (flags.scope && flags.scope !== "all") {
    bullets = bullets.filter(b => b.scope === flags.scope);
  }
  if (flags.category) {
    const cat = flags.category.toLowerCase();
    bullets = bullets.filter(b => b.category?.toLowerCase() === cat);
  }

  // Calculate scores and rank
  const scored = bullets.map(b => ({
    bullet: b,
    score: getEffectiveScore(b, config)
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  const topN = scored.slice(0, count);

  // Format output
  const ranked: RankedBullet[] = topN.map((s, i) => ({
    rank: i + 1,
    id: s.bullet.id,
    score: Number(s.score.toFixed(2)),
    content: s.bullet.content,
    category: s.bullet.category || "uncategorized",
    scope: s.bullet.scope || "global",
    maturity: s.bullet.maturity || "candidate",
    feedback: {
      helpful: s.bullet.helpfulCount || 0,
      harmful: s.bullet.harmfulCount || 0
    },
    lastUsed: formatLastHelpful(s.bullet)
  }));

  if (flags.json) {
    printJsonResult({
      timestamp: new Date().toISOString(),
      count: ranked.length,
      filters: {
        scope: flags.scope || "all",
        category: flags.category || null
      },
      bullets: ranked
    });
    return;
  }

  // Human-readable output
  printTopBullets(ranked, flags);
}

function printTopBullets(bullets: RankedBullet[], flags: TopFlags): void {
  const style = getOutputStyle();
  const cli = getCliName();
  const maxWidth = Math.min(style.width, 84);
  const divider = chalk.dim(formatRule("─", { maxWidth }));
  const wrapWidth = Math.max(24, maxWidth - 6);

  if (bullets.length === 0) {
    console.log(chalk.yellow("No bullets found matching the criteria."));
    if (flags.scope || flags.category) {
      console.log(chalk.gray(`Filters: scope=${flags.scope || "all"}, category=${flags.category || "any"}`));
    }
    return;
  }

  const filterDesc = [];
  if (flags.scope && flags.scope !== "all") filterDesc.push(`scope: ${flags.scope}`);
  if (flags.category) filterDesc.push(`category: ${flags.category}`);
  const filterStr = filterDesc.length > 0 ? ` • ${filterDesc.join(", ")}` : "";

  console.log(chalk.bold("TOP"));
  console.log(divider);
  console.log(chalk.dim(`Showing ${bullets.length} bullets${filterStr}`));
  console.log("");

  for (const b of bullets) {
    const maturityIcon = formatMaturityIcon(b.maturity);
    const maturityPrefix = maturityIcon ? `${maturityIcon} ` : "";
    const scoreColor = b.score >= 10 ? chalk.green : b.score >= 5 ? chalk.blue : b.score >= 0 ? chalk.white : chalk.red;

    console.log(
      `${chalk.bold(`${b.rank}. [${b.id}]`)}${chalk.dim(
        ` • score ${scoreColor(b.score.toFixed(1))} • ${maturityPrefix}${b.maturity} • ${b.category}/${b.scope}`
      )}`
    );

    for (const line of wrapText(b.content.trim().replace(/\s+/g, " "), wrapWidth)) {
      console.log(chalk.gray(`  ${line}`));
    }

    console.log(
      chalk.dim(
        `  Feedback: ${b.feedback.helpful}× helpful, ${b.feedback.harmful}× harmful • Last used: ${b.lastUsed}`
      )
    );
    console.log("");
  }

  console.log(chalk.gray(`${formatTipPrefix()}Use '${cli} playbook get <id>' to inspect, or '${cli} why <id>' for provenance.`));
}
