import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { TRAUMA_GUARD_SCRIPT } from "../trauma_guard_script.js";
import { 
  ensureDir, 
  fileExists, 
  getCliName, 
  printJsonResult,
  reportError 
} from "../utils.js";
import { ErrorCode } from "../types.js";

export async function guardCommand(flags: { install?: boolean; json?: boolean }) {
  const startedAtMs = Date.now();
  const command = "guard";
  const cli = getCliName();

  try {
    if (flags.install) {
      await installGuard(flags.json);
      return;
    }

    reportError("Missing required flag: --install", {
      code: ErrorCode.MISSING_REQUIRED,
      hint: `Example: ${cli} guard --install --json`,
      details: { missing: "--install" },
      json: flags.json,
      command,
      startedAtMs,
    });
  } catch (err: any) {
    reportError(err instanceof Error ? err : String(err), {
      code: ErrorCode.INTERNAL_ERROR,
      json: flags.json,
      command,
      startedAtMs,
    });
  }
}

export async function installGuard(json?: boolean, silent?: boolean) {
  const startedAtMs = Date.now();
  const command = "guard";
  const cli = getCliName();
  const claudeDir = ".claude";
  const hooksDir = path.join(claudeDir, "hooks");
  const settingsPath = path.join(claudeDir, "settings.json");
  const scriptName = "trauma_guard.py";
  const scriptPath = path.join(hooksDir, scriptName);

  // 1. Ensure directories
  if (!(await fileExists(claudeDir))) {
    if (silent) return;
    reportError("No .claude directory found. Is this a Claude Code project?", {
      code: ErrorCode.FILE_NOT_FOUND,
      hint: `Run this command from a project root that contains a .claude directory.`,
      details: { missing: ".claude" },
      json,
      command,
      startedAtMs,
    });
    return;
  }

  await ensureDir(hooksDir);

  // 2. Write Script
  await fs.writeFile(scriptPath, TRAUMA_GUARD_SCRIPT, { encoding: "utf-8", mode: 0o755 });

  // 3. Update settings.json
  let settings: any = {};
  if (await fileExists(settingsPath)) {
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(content);
    } catch (e) {
      const msg = "Error: Could not parse .claude/settings.json (invalid JSON or comments). Aborting to prevent data loss.";
      if (!silent) {
        reportError(msg, {
          code: ErrorCode.CONFIG_INVALID,
          hint: `Fix ${settingsPath} (must be strict JSON), then re-run: ${cli} guard --install`,
          details: { path: settingsPath },
          json,
          command,
          startedAtMs,
        });
        if (!json) {
          console.error("Please manually add this hook to 'PreToolUse':");
          console.log(
            JSON.stringify(
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: `$CLAUDE_PROJECT_DIR/.claude/hooks/${scriptName}` }],
              },
              null,
              2
            )
          );
        }
      }
      return;
    }
  }

  // Ensure hooks structure (defensive: settings.json is user-owned)
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

  // Check if already installed
  const alreadyInstalled = (settings.hooks.PreToolUse as any[]).some((entry: any) => {
    if (!entry || typeof entry !== "object") return false;
    const hooks = (entry as any).hooks;
    if (!Array.isArray(hooks)) return false;
    return hooks.some((hook: any) => typeof hook?.command === "string" && hook.command.includes(scriptName));
  });

  if (!alreadyInstalled) {
    // Add hook
    settings.hooks.PreToolUse.push({
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: `$CLAUDE_PROJECT_DIR/.claude/hooks/${scriptName}`
        }
      ]
    });
    
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  }

  if (silent) return;

  if (json) {
    printJsonResult(
      command,
      {
        message: alreadyInstalled ? "Trauma guard already installed." : "Trauma guard installed successfully.",
        alreadyInstalled,
        scriptPath,
        settingsPath,
      },
      { startedAtMs }
    );
  } else {
    console.log(chalk.green(`✓ Installed ${scriptName} to ${hooksDir}`));
    console.log(chalk.green(`✓ ${alreadyInstalled ? "Verified" : "Updated"} ${settingsPath}`));
    console.log(chalk.bold.yellow("\nIMPORTANT: You must restart Claude Code for the hook to take effect."));
  }
}
