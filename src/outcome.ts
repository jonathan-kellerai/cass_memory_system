import fs from "node:fs/promises";
import path from "node:path";
import { Config } from "./types.js";
import { expandPath, ensureDir, fileExists } from "./utils.js";
import { sanitize } from "./security.js";
import { getSanitizeConfig } from "./config.js";

export type OutcomeStatus = "success" | "failure" | "partial";

export interface OutcomeInput {
  sessionId: string;
  outcome: OutcomeStatus;
  rulesUsed?: string[];
  notes?: string;
  durationSec?: number;
  task?: string;
}

export interface OutcomeRecord extends OutcomeInput {
  recordedAt: string;
  path: string;
}

export async function resolveOutcomeLogPath(): Promise<string> {
  const repoPath = expandPath(".cass/outcomes.jsonl");
  const repoDirExists = await fileExists(expandPath(".cass"));

  if (repoDirExists) {
    return repoPath;
  }

  return expandPath("~/.cass-memory/outcomes.jsonl");
}

export async function recordOutcome(
  input: OutcomeInput,
  config: Config
): Promise<OutcomeRecord> {
  const targetPath = await resolveOutcomeLogPath();
  const sanitizeConfig = getSanitizeConfig(config);
  const normalizedSanitizeConfig = {
    ...sanitizeConfig,
    extraPatterns: (sanitizeConfig.extraPatterns || []).map((p) =>
      typeof p === "string" ? new RegExp(p, "g") : p
    )
  };

  const cleanedNotes = input.notes
    ? sanitize(input.notes, normalizedSanitizeConfig)
    : undefined;

  const record: OutcomeRecord = {
    ...input,
    rulesUsed: input.rulesUsed || [],
    notes: cleanedNotes,
    recordedAt: new Date().toISOString(),
    path: targetPath
  };

  await ensureDir(path.dirname(targetPath));
  await fs.appendFile(targetPath, JSON.stringify(record) + "\n", "utf-8");

  return record;
}

export async function loadOutcomes(
  config: Config,
  limit = 100
): Promise<OutcomeRecord[]> {
  const targetPath = await resolveOutcomeLogPath();
  if (!(await fileExists(targetPath))) return [];

  const content = await fs.readFile(targetPath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const parsed = lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line) as OutcomeRecord;
      } catch {
        return null;
      }
    })
    .filter((x): x is OutcomeRecord => Boolean(x));

  // Sanitize again on read for safety
  const sanitizeConfig = getSanitizeConfig(config);
  const normalizedSanitizeConfig = {
    ...sanitizeConfig,
    extraPatterns: (sanitizeConfig.extraPatterns || []).map((p) =>
      typeof p === "string" ? new RegExp(p, "g") : p
    )
  };

  return parsed.map((o) => ({
    ...o,
    notes: o.notes ? sanitize(o.notes, normalizedSanitizeConfig) : o.notes
  }));
}

