import { loadConfig } from "../config.js";
import {
  loadMergedPlaybook,
  exportToMarkdown,
  exportToAgentsMd,
  exportToClaudeMd
} from "../playbook.js";
import { error as logError } from "../utils.js";
import chalk from "chalk";
import fs from "node:fs/promises";

export async function projectCommand(
  flags: { output?: string; format?: string; top?: number; showCounts?: boolean }
) {
  const config = await loadConfig();
  const playbook = await loadMergedPlaybook(config);
  const showCounts = flags.showCounts !== false; // default true

  let output = "";

  switch (flags.format) {
    case "raw":
    case "json":
      output = JSON.stringify(playbook, null, 2);
      break;
    case "yaml":
      const yaml = await import("yaml");
      output = yaml.stringify(playbook);
      break;
    case "claude.md":
    case "claude":
      output = exportToClaudeMd(playbook, config, {
        topN: flags.top,
        showCounts
      });
      break;
    case "agents.md":
    case "agents":
    default:
      output = exportToAgentsMd(playbook, config, {
        topN: flags.top,
        showCounts
      });
      break;
  }

  if (flags.output) {
    await fs.writeFile(flags.output, output);
    console.log(chalk.green(`✓ Exported to ${flags.output}`));
  } else {
    console.log(output);
  }
}
