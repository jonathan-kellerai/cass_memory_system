/**
 * E2E Tests for CLI prune command - Bulk bullet removal
 */
import { describe, it, expect } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import yaml from "yaml";
import { pruneCommand } from "../src/commands/prune.js";
import { withTempCassHome, type TestEnv } from "./helpers/temp.js";
import { createE2ELogger } from "./helpers/e2e-logger.js";
import { createTestConfig, createTestPlaybook, createBullet, daysAgo } from "./helpers/factories.js";

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: any[]) => {
    errors.push(args.map(String).join(" "));
  };

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

async function writeTestConfig(env: TestEnv): Promise<void> {
  const config = createTestConfig({
    cassPath: "__cass_not_installed__",
    playbookPath: env.playbookPath,
    diaryDir: env.diaryDir,
    verbose: false,
    jsonOutput: false,
  });
  await writeFile(env.configPath, JSON.stringify(config, null, 2), "utf-8");
}

async function withNoColor<T>(fn: () => Promise<T>): Promise<T> {
  const originalNoColor = process.env.NO_COLOR;
  const originalForceColor = process.env.FORCE_COLOR;
  process.env.NO_COLOR = "1";
  process.env.FORCE_COLOR = "0";
  try {
    return await fn();
  } finally {
    process.env.NO_COLOR = originalNoColor;
    process.env.FORCE_COLOR = originalForceColor;
  }
}

async function withCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

describe("E2E: CLI prune command", () => {
  it.serial("rejects when no filter is specified", async () => {
    const log = createE2ELogger("cli-prune: no filter");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const playbook = createTestPlaybook([
          createBullet({ id: "b-prune-1", content: "Test bullet" }),
        ]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ json: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);
        expect(payload.success).toBe(false);
        expect(payload.error.code).toBe("MISSING_REQUIRED");
      });
    });
  });

  it.serial("dry-run with --content-prefix identifies matching bullets", async () => {
    const log = createE2ELogger("cli-prune: content-prefix dry-run");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const failureBullet1 = createBullet({
          id: "b-prune-fail1",
          content: "FAILURE: Bash - command not found",
          category: "debugging",
        });
        const failureBullet2 = createBullet({
          id: "b-prune-fail2",
          content: "FAILURE: Read - file not found",
          category: "debugging",
        });
        const keepBullet = createBullet({
          id: "b-prune-keep",
          content: "Always validate user input",
          category: "security",
        });

        const playbook = createTestPlaybook([failureBullet1, failureBullet2, keepBullet]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ contentPrefix: "FAILURE:", dryRun: true, json: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);

        expect(payload.success).toBe(true);
        expect(payload.data.dryRun).toBe(true);
        expect(payload.data.removed).toBe(2);
        expect(payload.data.totalBefore).toBe(3);
        expect(payload.data.totalAfter).toBe(1);

        const ids = payload.data.candidates.map((c: any) => c.id);
        expect(ids).toContain("b-prune-fail1");
        expect(ids).toContain("b-prune-fail2");
        expect(ids).not.toContain("b-prune-keep");
      });
    });
  });

  it.serial("dry-run with --deprecated identifies deprecated bullets", async () => {
    const log = createE2ELogger("cli-prune: deprecated dry-run");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const deprecatedBullet = createBullet({
          id: "b-prune-dep",
          content: "Old deprecated rule",
          deprecated: true,
          maturity: "deprecated",
          state: "retired",
        });
        const activeBullet = createBullet({
          id: "b-prune-active",
          content: "Active rule",
        });

        const playbook = createTestPlaybook([deprecatedBullet, activeBullet]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ deprecated: true, dryRun: true, json: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);

        expect(payload.success).toBe(true);
        expect(payload.data.removed).toBe(1);
        expect(payload.data.candidates[0].id).toBe("b-prune-dep");
      });
    });
  });

  it.serial("dry-run with --stale-days identifies stale zero-feedback candidates", async () => {
    const log = createE2ELogger("cli-prune: stale-days dry-run");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const staleBullet = createBullet({
          id: "b-prune-stale",
          content: "Old stale candidate",
          maturity: "candidate",
          helpfulCount: 0,
          harmfulCount: 0,
          createdAt: daysAgo(60),
          updatedAt: daysAgo(60),
        });
        const freshBullet = createBullet({
          id: "b-prune-fresh",
          content: "Fresh candidate",
          maturity: "candidate",
          helpfulCount: 0,
          harmfulCount: 0,
          createdAt: daysAgo(5),
          updatedAt: daysAgo(5),
        });
        const feedbackBullet = createBullet({
          id: "b-prune-feedback",
          content: "Old but has feedback",
          maturity: "candidate",
          helpfulCount: 1,
          harmfulCount: 0,
          createdAt: daysAgo(60),
          updatedAt: daysAgo(60),
        });

        const playbook = createTestPlaybook([staleBullet, freshBullet, feedbackBullet]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ staleDays: 30, dryRun: true, json: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);

        expect(payload.success).toBe(true);
        expect(payload.data.removed).toBe(1);
        expect(payload.data.candidates[0].id).toBe("b-prune-stale");
      });
    });
  });

  it.serial("actually removes bullets with --yes (non-dry-run)", async () => {
    const log = createE2ELogger("cli-prune: actual removal");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const failureBullet = createBullet({
          id: "b-prune-rm-fail",
          content: "FAILURE: Bash - error",
          category: "debugging",
        });
        const keepBullet = createBullet({
          id: "b-prune-rm-keep",
          content: "Valid rule to keep",
          category: "security",
        });

        const playbook = createTestPlaybook([failureBullet, keepBullet]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ contentPrefix: "FAILURE:", yes: true, json: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);

        expect(payload.success).toBe(true);
        expect(payload.data.dryRun).toBe(false);
        expect(payload.data.removed).toBe(1);
        expect(payload.data.totalAfter).toBe(1);
        expect(payload.data.backupPath).toBeDefined();

        // Verify the playbook on disk
        const savedContent = await readFile(env.playbookPath, "utf-8");
        const savedPlaybook = yaml.parse(savedContent);
        expect(savedPlaybook.bullets.length).toBe(1);
        expect(savedPlaybook.bullets[0].id).toBe("b-prune-rm-keep");
      });
    });
  });

  it.serial("handles empty playbook gracefully", async () => {
    const log = createE2ELogger("cli-prune: empty playbook");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const playbook = createTestPlaybook([]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ contentPrefix: "FAILURE:", dryRun: true, json: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);

        expect(payload.success).toBe(true);
        expect(payload.data.removed).toBe(0);
      });
    });
  });

  it.serial("combined filters work together (OR logic)", async () => {
    const log = createE2ELogger("cli-prune: combined filters");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const failureBullet = createBullet({
          id: "b-prune-combo-fail",
          content: "FAILURE: Bash - error",
          category: "debugging",
          createdAt: daysAgo(5),
        });
        const deprecatedBullet = createBullet({
          id: "b-prune-combo-dep",
          content: "Deprecated old rule",
          deprecated: true,
          maturity: "deprecated",
          state: "retired",
          createdAt: daysAgo(5),
        });
        const staleBullet = createBullet({
          id: "b-prune-combo-stale",
          content: "Stale zero-feedback candidate",
          maturity: "candidate",
          helpfulCount: 0,
          harmfulCount: 0,
          createdAt: daysAgo(60),
        });
        const keepBullet = createBullet({
          id: "b-prune-combo-keep",
          content: "Fresh valid rule",
          createdAt: daysAgo(2),
        });

        const playbook = createTestPlaybook([failureBullet, deprecatedBullet, staleBullet, keepBullet]);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({
                deprecated: true,
                staleDays: 30,
                contentPrefix: "FAILURE:",
                dryRun: true,
                json: true,
              });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);
        const payload = JSON.parse(stdout);

        expect(payload.success).toBe(true);
        expect(payload.data.removed).toBe(3);
        expect(payload.data.totalAfter).toBe(1);

        const ids = payload.data.candidates.map((c: any) => c.id);
        expect(ids).toContain("b-prune-combo-fail");
        expect(ids).toContain("b-prune-combo-dep");
        expect(ids).toContain("b-prune-combo-stale");
        expect(ids).not.toContain("b-prune-combo-keep");
      });
    });
  });

  it.serial("human-readable dry-run output shows summary", async () => {
    const log = createE2ELogger("cli-prune: human readable");
    log.setRepro("bun test test/cli-prune.e2e.test.ts");

    await log.run(async () => {
      await withTempCassHome(async (env) => {
        await writeTestConfig(env);

        const bullets = Array.from({ length: 8 }, (_, i) =>
          createBullet({
            id: `b-prune-hr-${i}`,
            content: `FAILURE: Tool${i} - some error`,
            category: "debugging",
          }),
        );
        bullets.push(createBullet({ id: "b-prune-hr-keep", content: "Keep this" }));

        const playbook = createTestPlaybook(bullets);
        await writeFile(env.playbookPath, yaml.stringify(playbook));

        const capture = captureConsole();
        try {
          await withNoColor(async () => {
            await withCwd(env.home, async () => {
              await pruneCommand({ contentPrefix: "FAILURE:", dryRun: true });
            });
          });
        } finally {
          capture.restore();
        }

        const stdout = capture.logs.join("\n");
        log.snapshot("stdout", stdout);

        expect(stdout).toContain("PRUNE (dry run)");
        expect(stdout).toContain("Would remove 8 of 9 bullets");
        expect(stdout).toContain("... and 3 more");
        expect(stdout).toContain("To execute:");
      });
    });
  });
});
