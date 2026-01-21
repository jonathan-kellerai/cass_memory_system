/**
 * Unit tests for command modules that are otherwise covered only by E2E.
 * Focus: input validation + JSON output shape using real file I/O helpers.
 */
import { describe, test, expect } from "bun:test";
import { writeFileSync } from "node:fs";
import yaml from "yaml";

import { guardCommand } from "../src/commands/guard.js";
import { initCommand } from "../src/commands/init.js";
import { markCommand } from "../src/commands/mark.js";
import { similarCommand } from "../src/commands/similar.js";
import { startersCommand } from "../src/commands/starters.js";
import { statsCommand } from "../src/commands/stats.js";
import { traumaCommand } from "../src/commands/trauma.js";
import { usageCommand } from "../src/commands/usage.js";

import { withTempCassHome } from "./helpers/temp.js";
import { createTestBullet, createTestPlaybook } from "./helpers/factories.js";

type Capture = {
  logs: string[];
  errors: string[];
  restore: () => void;
  output: () => string;
};

function captureConsole(): Capture {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  return {
    logs,
    errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
    output: () => [...logs, ...errors].join(""),
  };
}

function parseJsonError(stdout: string): any {
  const payload = JSON.parse(stdout) as any;
  expect(payload.success).toBe(false);
  return payload.error;
}

function parseJsonSuccess(stdout: string): any {
  const payload = JSON.parse(stdout) as any;
  expect(payload.success).toBe(true);
  return payload.data;
}

async function withKeepTemp<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.KEEP_TEMP;
  process.env.KEEP_TEMP = "1";
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.KEEP_TEMP;
    } else {
      process.env.KEEP_TEMP = previous;
    }
  }
}

describe("commands basic unit coverage (JSON + validation)", () => {
  test("guardCommand reports missing flags (JSON error)", async () => {
    const capture = captureConsole();
    process.exitCode = 0;
    try {
      await guardCommand({ json: true });
    } finally {
      capture.restore();
    }

    const err = parseJsonError(capture.output());
    expect(err.code).toBe("MISSING_REQUIRED");
  });

  test("initCommand refuses --force without --yes when state exists (JSON error)", async () => {
    await withKeepTemp(async () => {
      await withTempCassHome(async (env) => {
        writeFileSync(env.configPath, JSON.stringify({ cassPath: "cass" }, null, 2));
        writeFileSync(env.playbookPath, yaml.stringify(createTestPlaybook([])));

        const capture = captureConsole();
        process.exitCode = 0;
        try {
          await initCommand({ force: true, json: true });
        } finally {
          capture.restore();
        }

        const err = parseJsonError(capture.output());
        expect(err.code).toBe("MISSING_REQUIRED");
      });
    });
  });

  test("markCommand requires exactly one of helpful/harmful (JSON error)", async () => {
    const capture = captureConsole();
    process.exitCode = 0;
    try {
      await markCommand("b-missing-flags", { json: true });
    } finally {
      capture.restore();
    }

    const err = parseJsonError(capture.output());
    expect(err.code).toBe("MISSING_REQUIRED");
  });

  test("similarCommand rejects invalid scope (JSON error)", async () => {
    const capture = captureConsole();
    process.exitCode = 0;
    try {
      await similarCommand("find me", { json: true, scope: "bad-scope" as any });
    } finally {
      capture.restore();
    }

    const err = parseJsonError(capture.output());
    expect(err.code).toBe("INVALID_INPUT");
  });

  test("traumaCommand rejects unknown action (JSON error)", async () => {
    const capture = captureConsole();
    process.exitCode = 0;
    try {
      await traumaCommand("unknown", [], { json: true });
    } finally {
      capture.restore();
    }

    const err = parseJsonError(capture.output());
    expect(err.code).toBe("INVALID_INPUT");
  });

  test("startersCommand returns built-in starters (JSON)", async () => {
    await withKeepTemp(async () => {
      await withTempCassHome(async () => {
        const capture = captureConsole();
        process.exitCode = 0;
        try {
          await startersCommand({ json: true });
        } finally {
          capture.restore();
        }

        const data = parseJsonSuccess(capture.output());
        expect(Array.isArray(data.starters)).toBe(true);
        expect(data.starters.length).toBeGreaterThan(0);
        expect(data.starters.some((s: any) => s.name === "general")).toBe(true);
      });
    });
  });

  test("statsCommand returns JSON stats for playbook (JSON)", async () => {
    await withKeepTemp(async () => {
      await withTempCassHome(async (env) => {
        const bullets = [
          createTestBullet({ id: "b-active", state: "active", maturity: "candidate", scope: "global" }),
          createTestBullet({ id: "b-retired", state: "retired", maturity: "deprecated", scope: "workspace" }),
        ];
        writeFileSync(env.playbookPath, yaml.stringify(createTestPlaybook(bullets)));

        const capture = captureConsole();
        process.exitCode = 0;
        try {
          await statsCommand({ json: true });
        } finally {
          capture.restore();
        }

        const data = parseJsonSuccess(capture.output());
        expect(data.total).toBe(2);
        expect(data.byState.active).toBe(1);
        expect(data.byState.retired).toBe(1);
      });
    });
  });

  test("usageCommand returns JSON usage stats", async () => {
    await withKeepTemp(async () => {
      await withTempCassHome(async (env) => {
        writeFileSync(
          env.configPath,
          JSON.stringify(
            { budget: { dailyLimit: 1, monthlyLimit: 2, warningThreshold: 80, currency: "USD" } },
            null,
            2
          )
        );

        const capture = captureConsole();
        process.exitCode = 0;
        try {
          await usageCommand({ json: true });
        } finally {
          capture.restore();
        }

        const data = parseJsonSuccess(capture.output());
        expect(typeof data.today).toBe("number");
        expect(typeof data.month).toBe("number");
        expect(typeof data.total).toBe("number");
        expect(data.dailyLimit).toBe(1);
        expect(data.monthlyLimit).toBe(2);
      });
    });
  });
});
