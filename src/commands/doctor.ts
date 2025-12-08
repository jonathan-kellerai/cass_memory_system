import { loadConfig } from "../config.js";
import { cassAvailable, cassStats } from "../cass.js";
import { loadMergedPlaybook } from "../playbook.js";
import { fileExists, expandPath } from "../utils.js";
import { isLLMAvailable } from "../llm.js";
import chalk from "chalk";
import fs from "node:fs/promises";

export async function doctorCommand(options: { json?: boolean; fix?: boolean }): Promise<void> {
  const config = await loadConfig();
  const checks = [];

  // 1. Cass Integration
  const cassOk = cassAvailable(config.cassPath);
  checks.push({
    category: "Cass Integration",
    status: cassOk ? "pass" : "fail",
    message: cassOk ? "cass CLI found" : "cass CLI not found",
    details: cassOk ? await cassStats(config.cassPath) : undefined
  });

  // 2. Storage
  const playbookExists = await fileExists(config.playbookPath);
  const diaryDirExists = await fileExists(config.diaryDir);
  
  checks.push({
    category: "Storage",
    status: playbookExists && diaryDirExists ? "pass" : "warn",
    message: `Playbook: ${playbookExists ? "Found" : "Missing"}, Diary: ${diaryDirExists ? "Found" : "Missing"}`
  });

  // 3. Configuration
  const hasApiKey = isLLMAvailable(config.provider);
  checks.push({
    category: "LLM Configuration",
    status: hasApiKey ? "pass" : "fail",
    message: `Provider: ${config.provider}, API Key: ${hasApiKey ? "Set" : "Missing"}`
  });

  // Output
  if (options.json) {
    console.log(JSON.stringify({ checks }, null, 2));
    return;
  }

  console.log(chalk.bold("\n🏥 System Health Check\n"));
  
  let overallStatus = "healthy";

  for (const check of checks) {
    const icon = check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️ " : "❌";
    console.log(`${icon} ${chalk.bold(check.category)}: ${check.message}`);
    if (check.status === "fail") overallStatus = "unhealthy";
    else if (check.status === "warn" && overallStatus !== "unhealthy") overallStatus = "degraded";
  }

  console.log("");
  if (overallStatus === "healthy") console.log(chalk.green("System is healthy ready to rock! 🚀"));
  else if (overallStatus === "degraded") console.log(chalk.yellow("System is running in degraded mode."));
  else console.log(chalk.red("System has critical issues."));
}