import { getDefaultConfig, saveConfig } from "../config.js";
import { createEmptyPlaybook, savePlaybook } from "../playbook.js";
import { expandPath, fileExists, ensureDir, warn, log, resolveRepoDir, ensureRepoStructure } from "../utils.js";
import { cassAvailable } from "../cass.js";
import chalk from "chalk";

export async function initCommand(options: { force?: boolean; json?: boolean; repo?: boolean }) {
  // If --repo flag is provided, initialize repo-level .cass/ structure
  if (options.repo) {
    await initRepoCommand(options);
    return;
  }

  const config = getDefaultConfig();
  const configPath = expandPath("~/.cass-memory/config.json");
  const playbookPath = expandPath(config.playbookPath);
  const diaryDir = expandPath(config.diaryDir);
  const reflectionsDir = expandPath("~/.cass-memory/reflections");
  const embeddingsDir = expandPath("~/.cass-memory/embeddings");
  const costDir = expandPath("~/.cass-memory/cost");

  const alreadyInitialized = await fileExists(configPath);

  if (alreadyInitialized && !options.force) {
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: "Already initialized. Use --force to reinitialize."
      }));
    } else {
      log(chalk.yellow("Already initialized. Use --force to reinitialize."), true);
    }
    return;
  }

  // 1. Create directories
  await ensureDir(diaryDir);
  await ensureDir(reflectionsDir);
  await ensureDir(embeddingsDir);
  await ensureDir(costDir);

  // 2. Create default config
  await saveConfig(config);

  // 3. Create empty playbook
  const playbook = createEmptyPlaybook();
  await savePlaybook(playbook, playbookPath);

  // 4. Check cass
  const cassOk = cassAvailable(config.cassPath);
  if (!cassOk && !options.json) {
    warn("cass is not available. Some features will not work.");
    console.log("Install cass from https://github.com/Dicklesworthstone/coding_agent_session_search");
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      configPath,
      playbookPath,
      cassAvailable: cassOk
    }, null, 2));
  } else {
    console.log(chalk.green("✓ Created ~/.cass-memory/config.json"));
    console.log(chalk.green("✓ Created ~/.cass-memory/playbook.yaml"));
    console.log(chalk.green(`✓ Created directories: ${diaryDir}, ${reflectionsDir}, ${embeddingsDir}`));
    console.log(`✓ cass available: ${cassOk ? chalk.green("yes") : chalk.red("no")}`);
    console.log("");
    console.log(chalk.bold("cass-memory initialized successfully!"));
    console.log("");
    console.log("Next steps:");
    console.log(chalk.cyan("  cass-memory context \"your task\" --json  # Get context for a task"));
    console.log(chalk.cyan("  cass-memory doctor                       # Check system health"));
    console.log(chalk.cyan("  cass-memory init --repo                  # Initialize repo-level .cass/"));
  }
}

/**
 * Initialize repo-level .cass/ directory structure.
 * Creates project-specific playbook and toxic.log for team sharing.
 */
async function initRepoCommand(options: { force?: boolean; json?: boolean }) {
  const cassDir = await resolveRepoDir();

  if (!cassDir) {
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: "Not in a git repository. Run from within a git repo."
      }));
    } else {
      console.error(chalk.red("Error: Not in a git repository."));
      console.error("Run this command from within a git repository.");
    }
    process.exit(1);
  }

  // Check if already initialized
  const playbookPath = `${cassDir}/playbook.yaml`;
  const alreadyInitialized = await fileExists(playbookPath);

  if (alreadyInitialized && !options.force) {
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: "Repo already has .cass/ directory. Use --force to reinitialize."
      }));
    } else {
      console.log(chalk.yellow("Repo already has .cass/ directory. Use --force to reinitialize."));
    }
    return;
  }

  // Create the structure
  const result = await ensureRepoStructure(cassDir);

  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      cassDir,
      created: result.created,
      existed: result.existed
    }, null, 2));
  } else {
    console.log(chalk.bold("\n🏗️  Initializing repo-level .cass/ structure\n"));

    if (result.created.length > 0) {
      for (const file of result.created) {
        console.log(chalk.green(`✓ Created .cass/${file}`));
      }
    }

    if (result.existed.length > 0) {
      for (const file of result.existed) {
        console.log(chalk.blue(`• .cass/${file} already exists`));
      }
    }

    console.log("");
    console.log(chalk.bold("Repo-level cass-memory initialized!"));
    console.log("");
    console.log("The .cass/ directory contains:");
    console.log(chalk.cyan("  • playbook.yaml  - Project-specific rules (commit to git)"));
    console.log(chalk.cyan("  • toxic.log      - Blocked patterns for this project"));
    console.log("");
    console.log("These files are merged with your global ~/.cass-memory/ settings.");
    console.log("Project rules take precedence over global rules.");
    console.log("");
    console.log(chalk.yellow("Remember: Commit .cass/ to version control to share with your team!"));
  }
}
