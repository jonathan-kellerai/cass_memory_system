import { loadConfig, saveConfig } from "../config.js";
import { loadMergedPlaybook, savePlaybook, findBullet } from "../playbook.js";
import { getEffectiveScore, calculateMaturityState } from "../scoring.js";
import { now, error as logError, expandPath } from "../utils.js";
import chalk from "chalk";

export async function markCommand(
  bulletId: string,
  flags: { helpful?: boolean; harmful?: boolean; reason?: string; session?: string; json?: boolean }
) {
  if (!flags.helpful && !flags.harmful) {
    logError("Must specify --helpful or --harmful");
    process.exit(1);
  }

  const config = await loadConfig();
  // We need to load the specific playbook where this bullet lives to save it.
  // loadMergedPlaybook gives us a view, but saving back is tricky if it's merged.
  // Simplified V1: Load global playbook. If not found, check repo.
  // Actually, findBullet search in merged, but we need to know WHICH file to save to.
  // For now, let's assume global playbook for V1 or intelligent save in playbook.ts.
  // Let's load the actual file containing the bullet.
  
  // Strategy: Load global. If found, update global. Else load repo. If found, update repo.
  let playbook = await loadMergedPlaybook(config);
  const bullet = findBullet(playbook, bulletId);
  
  if (!bullet) {
    logError(`Bullet not found: ${bulletId}`);
    process.exit(1);
  }

  // Determine source file (Global vs Repo)
  // Ideally bullet has a source flag or we check again.
  // Hack for V1: Just load global, check if there. If not, assume repo.
  // Better: loadMergedPlaybook should handle saving? No, it returns a merged object.
  
  // Reload strictly for saving
  // Check Global
  const globalPath = expandPath(config.playbookPath);
  const fs = await import("node:fs/promises"); // dynamic import or top level
  // re-import loadPlaybook
  const { loadPlaybook } = await import("../playbook.js");
  
  let targetPlaybook = await loadPlaybook(config.playbookPath);
  let targetBullet = findBullet(targetPlaybook, bulletId);
  let savePath = config.playbookPath;

  if (!targetBullet) {
    // Check Repo
    // detect repo context logic duplicated here?
    // Let's assume .cass/playbook.yaml for now
    const repoPath = ".cass/playbook.yaml";
    targetPlaybook = await loadPlaybook(repoPath);
    targetBullet = findBullet(targetPlaybook, bulletId);
    savePath = repoPath;
  }

  if (!targetBullet) {
    logError(`Critical error: Bullet ${bulletId} found in merged view but not in files.`);
    process.exit(1);
  }

  // Apply Update
  const type = flags.helpful ? "helpful" : "harmful";
  targetBullet.feedbackEvents.push({
    type,
    timestamp: now(),
    sessionPath: flags.session,
    reason: flags.reason
  });

  if (flags.helpful) targetBullet.helpfulCount++;
  else targetBullet.harmfulCount++;

  targetBullet.updatedAt = now();
  
  // Update State
  targetBullet.maturity = calculateMaturityState(targetBullet, config);

  // Save
  await savePlaybook(targetPlaybook, savePath);

  // Log Usage? (skip for V1 minimalist)

  // Output
  const score = getEffectiveScore(targetBullet, config);
  
  if (flags.json) {
    console.log(JSON.stringify({
      success: true,
      bulletId,
      type,
      newState: targetBullet.maturity,
      effectiveScore: score
    }, null, 2));
  } else {
    console.log(chalk.green(`✓ Marked bullet ${bulletId} as ${type}`));
    console.log(`  New State: ${targetBullet.maturity}`);
    console.log(`  Effective Score: ${score.toFixed(2)}`);
  }
}