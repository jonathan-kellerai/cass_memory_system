import {
  saveConfig,
  getDefaultConfig,
  getUserConfigPath,
  ensureConfigDirs
} from "../config.js";
import type { Config } from "../types.js";
import {
  loadPlaybook,
  savePlaybook,
  createEmptyPlaybook
} from "../playbook.js";
import { cassAvailable } from "../cass.js";
import { fileExists, expandPath, log, warn, error } from "../utils.js";
import chalk from "chalk";

export async function initCommand(options: { force?: boolean } = {}): Promise<void> {
  const configPath = getUserConfigPath();
  const configExists = await fileExists(configPath);

  if (configExists && !options.force) {
    error(`Already initialized at ${configPath}. Use --force to overwrite.`);
    return; // Don't exit, just return
  }

  log("Initializing cass-memory...", true);

  // 1. Create default config
  const config = getDefaultConfig();
  
  // 2. Create directories
  await ensureConfigDirs(config);

  // 3. Save config
  await saveConfig(config);
  console.log(chalk.green(`✓ Created configuration: ${configPath}`));

  // 4. Create empty playbook if missing
  const playbookPath = expandPath(config.playbookPath);
  if (!await fileExists(playbookPath)) {
    const playbook = createEmptyPlaybook();
    await savePlaybook(playbook, config);
    console.log(chalk.green(`✓ Created playbook: ${playbookPath}`));
  } else {
    console.log(chalk.blue(`ℹ Playbook already exists: ${playbookPath}`));
  }

  // 5. Check cass availability
  if (cassAvailable(config.cassPath)) {
    console.log(chalk.green("✓ cass CLI found and healthy"));
  } else {
    warn("cass CLI not found or not working. Some features will be disabled.");
    console.log(chalk.yellow("  Install from: https://github.com/Dicklesworthstone/coding_agent_session_search"));
  }

  console.log(chalk.bold("\nInitialization complete! 🚀"));
  console.log("Try: cm context \"fix a bug\"");
}
