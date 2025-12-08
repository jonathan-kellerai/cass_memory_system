/**
 * Unit tests for playbook get command.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { playbookCommand } from "../src/commands/playbook.js";
import { createTestPlaybook, createTestBullet, createTestConfig, createTestFeedbackEvent } from "./helpers/factories.js";
import { withTempDir } from "./helpers/temp.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";

// Helper to capture console output
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
    }
  };
}

// Helper to save playbook to path
async function savePlaybookToPath(playbook: any, playbookPath: string) {
  await writeFile(playbookPath, yaml.stringify(playbook));
}

describe("playbook get command", () => {
  // Save and restore environment
  let originalEnv: Record<string, string | undefined> = {};
  let originalHome: string | undefined;

  beforeEach(() => {
    originalEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    originalHome = process.env.HOME;
    // Set API key to avoid config errors
    process.env.ANTHROPIC_API_KEY = "sk-ant-api3-test-key";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    if (originalHome) {
      process.env.HOME = originalHome;
    }
  });

  it("displays bullet details for valid ID", async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullet = createTestBullet({
        id: "b-test123",
        content: "Always run tests before committing",
        category: "best-practice",
        maturity: "proven",
        helpfulCount: 12,
        harmfulCount: 1,
        tags: ["testing", "ci-cd"],
        sourceSessions: ["/sessions/session1.jsonl", "/sessions/session2.jsonl"],
        sourceAgents: ["claude", "cursor"],
      });
      const playbook = createTestPlaybook([bullet]);
      await savePlaybookToPath(playbook, playbookPath);

      // Create a minimal config in the temp home
      const configPath = path.join(dir, ".cass-memory", "config.json");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(configPath, JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-test123"], { json: false });
      } finally {
        capture.restore();
      }

      const output = capture.logs.join("\n");
      expect(output).toContain("BULLET: b-test123");
      expect(output).toContain("Always run tests before committing");
      expect(output).toContain("best-practice");
      expect(output).toContain("proven");
      expect(output).toContain("Positive feedback: 12");
      expect(output).toContain("Negative feedback: 1");
      expect(output).toContain("testing, ci-cd");
      expect(output).toContain("claude, cursor");
    });
  });

  it("returns JSON output with --json flag", async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullet = createTestBullet({
        id: "b-json-test",
        content: "Test bullet for JSON output",
        category: "testing",
        maturity: "candidate",
        helpfulCount: 5,
        harmfulCount: 0,
      });
      const playbook = createTestPlaybook([bullet]);
      await savePlaybookToPath(playbook, playbookPath);

      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(path.join(dir, ".cass-memory", "config.json"), JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-json-test"], { json: true });
      } finally {
        capture.restore();
      }

      const output = capture.logs.join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.bullet).toBeDefined();
      expect(result.bullet.id).toBe("b-json-test");
      expect(result.bullet.content).toBe("Test bullet for JSON output");
      expect(result.bullet.effectiveScore).toBeDefined();
      expect(result.bullet.ageDays).toBeDefined();
      expect(result.bullet.decayedHelpful).toBeDefined();
      expect(result.bullet.decayedHarmful).toBeDefined();
    });
  });

  it("shows deprecated status for deprecated bullets", async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullet = createTestBullet({
        id: "b-deprecated",
        content: "Deprecated rule",
        category: "old",
        deprecated: true,
        deprecationReason: "No longer applicable",
        deprecatedAt: new Date().toISOString(),
      });
      const playbook = createTestPlaybook([bullet]);
      await savePlaybookToPath(playbook, playbookPath);

      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(path.join(dir, ".cass-memory", "config.json"), JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-deprecated"], { json: false });
      } finally {
        capture.restore();
      }

      const output = capture.logs.join("\n");
      expect(output).toContain("DEPRECATED");
      expect(output).toContain("No longer applicable");
    });
  });

  it("shows pinned status for pinned bullets", async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullet = createTestBullet({
        id: "b-pinned",
        content: "Important pinned rule",
        category: "critical",
        pinned: true,
      });
      const playbook = createTestPlaybook([bullet]);
      await savePlaybookToPath(playbook, playbookPath);

      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(path.join(dir, ".cass-memory", "config.json"), JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-pinned"], { json: false });
      } finally {
        capture.restore();
      }

      const output = capture.logs.join("\n");
      expect(output).toContain("PINNED");
    });
  });

  it("exits with error for non-existent bullet", { timeout: 15000 }, async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullet = createTestBullet({ id: "b-exists" });
      const playbook = createTestPlaybook([bullet]);
      await savePlaybookToPath(playbook, playbookPath);

      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(path.join(dir, ".cass-memory", "config.json"), JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      // Mock process.exit to prevent test runner from exiting
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-nonexistent"], { json: false });
      } catch {
        // Expected - process.exit was called
      } finally {
        capture.restore();
        process.exit = originalExit;
      }

      expect(exitCode).toBe(1);
      expect(capture.errors.some(e => e.includes("not found"))).toBe(true);
    });
  });

  it("suggests similar IDs when bullet not found", { timeout: 15000 }, async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullets = [
        createTestBullet({ id: "b-test-alpha" }),
        createTestBullet({ id: "b-test-beta" }),
        createTestBullet({ id: "b-other" }),
      ];
      const playbook = createTestPlaybook(bullets);
      await savePlaybookToPath(playbook, playbookPath);

      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(path.join(dir, ".cass-memory", "config.json"), JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-test"], { json: false });
      } catch {
        // Expected
      } finally {
        capture.restore();
        process.exit = originalExit;
      }

      expect(exitCode).toBe(1);
      // Should suggest similar IDs
      const output = capture.logs.join("\n");
      expect(output).toContain("b-test-alpha");
    });
  });

  it("returns JSON error with suggestions for non-existent bullet", { timeout: 15000 }, async () => {
    await withTempDir("playbook-get", async (dir) => {
      const playbookPath = path.join(dir, "playbook.yaml");
      const bullets = [
        createTestBullet({ id: "b-similar-one" }),
        createTestBullet({ id: "b-similar-two" }),
      ];
      const playbook = createTestPlaybook(bullets);
      await savePlaybookToPath(playbook, playbookPath);

      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(dir, ".cass-memory"), { recursive: true });
      const config = createTestConfig({ playbookPath });
      await writeFile(path.join(dir, ".cass-memory", "config.json"), JSON.stringify(config, null, 2));
      process.env.HOME = dir;

      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
        throw new Error(`process.exit(${code})`);
      }) as typeof process.exit;

      const capture = captureConsole();
      try {
        await playbookCommand("get", ["b-similar"], { json: true });
      } catch {
        // Expected
      } finally {
        capture.restore();
        process.exit = originalExit;
      }

      expect(exitCode).toBe(1);
      const output = capture.logs.join("\n");
      const result = JSON.parse(output);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });
});
