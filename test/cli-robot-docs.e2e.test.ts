/**
 * E2E Tests for CLI robot-docs command — machine-readable documentation
 *
 * Tests all five topics: guide, commands, examples, exit-codes, schemas.
 * robot-docs is a pure function: no disk I/O, always outputs JSON.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { robotDocsCommand } from "../src/commands/robot-docs.js";

// ── Console capture helper ────────────────────────────────────────────────────

function captureConsole() {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => { /* suppress */ };

  return {
    logs,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

function runCommand(opts: { topic?: string; json?: boolean }): unknown {
  const cap = captureConsole();
  try {
    // robotDocsCommand is sync-compatible (uses printJsonResult → console.log)
    void robotDocsCommand(opts);
  } finally {
    cap.restore();
  }
  const jsonLine = cap.logs.find((l) => l.trimStart().startsWith("{"));
  if (!jsonLine) throw new Error(`No JSON output for topic=${opts.topic ?? "guide"}`);
  return JSON.parse(jsonLine);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("E2E: CLI robot-docs command", () => {
  describe("top-level envelope", () => {
    it("always emits success=true and command=robot-docs", async () => {
      const result = runCommand({ topic: "guide" }) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.command).toBe("robot-docs");
      expect(result.data).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it("defaults to guide topic when topic is omitted", async () => {
      const result = runCommand({}) as Record<string, unknown>;
      const data = result.data as Record<string, unknown>;
      expect(data.topic).toBe("guide");
    });

    it("defaults to guide when topic is unrecognised", async () => {
      const result = runCommand({ topic: "nonexistent-topic" }) as Record<string, unknown>;
      const data = result.data as Record<string, unknown>;
      expect(data.topic).toBe("guide");
    });
  });

  describe("guide topic", () => {
    it("returns agent workflow with three steps", async () => {
      const result = runCommand({ topic: "guide" }) as Record<string, unknown>;
      const data = result.data as Record<string, unknown>;
      expect(data.topic).toBe("guide");
      const workflow = (data as any).agentWorkflow as Record<string, unknown>;
      expect(workflow.step1).toBeDefined();
      expect(workflow.step2).toBeDefined();
      expect(workflow.step3).toBeDefined();
    });

    it("returns expectations and operatorSetup sections", async () => {
      const data = (runCommand({ topic: "guide" }) as any).data;
      expect(data.expectations).toBeDefined();
      expect(data.operatorSetup).toBeDefined();
    });

    it("returns doNotDo list", async () => {
      const data = (runCommand({ topic: "guide" }) as any).data;
      expect(Array.isArray(data.doNotDo)).toBe(true);
      expect(data.doNotDo.length).toBeGreaterThan(0);
    });
  });

  describe("commands topic", () => {
    it("returns commands array", async () => {
      const data = (runCommand({ topic: "commands" }) as any).data;
      expect(data.topic).toBe("commands");
      expect(Array.isArray(data.commands)).toBe(true);
      expect(data.commands.length).toBeGreaterThan(0);
    });

    it("each command has name, group, description, and examples", async () => {
      const commands = (runCommand({ topic: "commands" }) as any).data.commands as any[];
      for (const cmd of commands) {
        expect(typeof cmd.name).toBe("string");
        expect(typeof cmd.group).toBe("string");
        expect(typeof cmd.description).toBe("string");
        expect(Array.isArray(cmd.examples)).toBe(true);
      }
    });

    it("includes core commands: context, reflect, validate, playbook", async () => {
      const commands = (runCommand({ topic: "commands" }) as any).data.commands as any[];
      const names = commands.map((c: any) => c.name);
      expect(names).toContain("context");
      expect(names).toContain("reflect");
      expect(names).toContain("validate");
      expect(names).toContain("playbook");
    });

    it("includes robot-docs and quickstart commands", async () => {
      const commands = (runCommand({ topic: "commands" }) as any).data.commands as any[];
      const names = commands.map((c: any) => c.name);
      expect(names).toContain("robot-docs");
      expect(names).toContain("quickstart");
    });

    it("flags are arrays of objects with flag and description", async () => {
      const commands = (runCommand({ topic: "commands" }) as any).data.commands as any[];
      const commandsWithFlags = commands.filter((c: any) => c.flags && c.flags.length > 0);
      expect(commandsWithFlags.length).toBeGreaterThan(0);
      for (const cmd of commandsWithFlags) {
        for (const f of cmd.flags) {
          expect(typeof f.flag).toBe("string");
          expect(typeof f.description).toBe("string");
        }
      }
    });
  });

  describe("examples topic", () => {
    it("returns examples object", async () => {
      const data = (runCommand({ topic: "examples" }) as any).data;
      expect(data.topic).toBe("examples");
      expect(data.examples).toBeDefined();
    });

    it("includes agentSession workflow example", async () => {
      const examples = (runCommand({ topic: "examples" }) as any).data.examples;
      expect(examples.agentSession).toBeDefined();
      expect(typeof examples.agentSession.description).toBe("string");
      expect(Array.isArray(examples.agentSession.steps)).toBe(true);
    });

    it("includes operatorSetup example", async () => {
      const examples = (runCommand({ topic: "examples" }) as any).data.examples;
      expect(examples.operatorSetup).toBeDefined();
      expect(Array.isArray(examples.operatorSetup.steps)).toBe(true);
    });

    it("includes machineReadableDocs example", async () => {
      const examples = (runCommand({ topic: "examples" }) as any).data.examples;
      expect(examples.machineReadableDocs).toBeDefined();
    });

    it("includes tokenOptimized example", async () => {
      const examples = (runCommand({ topic: "examples" }) as any).data.examples;
      expect(examples.tokenOptimized).toBeDefined();
    });
  });

  describe("exit-codes topic", () => {
    it("returns exit codes array", async () => {
      const data = (runCommand({ topic: "exit-codes" }) as any).data;
      expect(data.topic).toBe("exit-codes");
      expect(data.description).toBeDefined();
      expect(Array.isArray(data.codes)).toBe(true);
    });

    it("includes code 0 (success)", async () => {
      const codes = (runCommand({ topic: "exit-codes" }) as any).data.codes as any[];
      const success = codes.find((c: any) => c.code === 0);
      expect(success).toBeDefined();
      expect(success.name).toBe("SUCCESS");
    });

    it("includes code 2 (invalid input)", async () => {
      const codes = (runCommand({ topic: "exit-codes" }) as any).data.codes as any[];
      const invalid = codes.find((c: any) => c.code === 2);
      expect(invalid).toBeDefined();
      expect(invalid.name).toBe("INVALID_INPUT");
    });

    it("each code has code number, name string, description string", async () => {
      const codes = (runCommand({ topic: "exit-codes" }) as any).data.codes as any[];
      expect(codes.length).toBeGreaterThan(3);
      for (const c of codes) {
        expect(typeof c.code).toBe("number");
        expect(typeof c.name).toBe("string");
        expect(typeof c.description).toBe("string");
      }
    });
  });

  describe("schemas topic", () => {
    it("returns schemas object with version and defs", async () => {
      const data = (runCommand({ topic: "schemas" }) as any).data;
      expect(data.topic).toBe("schemas");
      expect(data.schema_version).toBeDefined();
      expect(data.$defs).toBeDefined();
    });

    it("includes $schema and version fields", async () => {
      const data = (runCommand({ topic: "schemas" }) as any).data;
      expect(data.$schema).toBeDefined();
      expect(data.version).toBeDefined();
    });

    it("includes commands definitions", async () => {
      const data = (runCommand({ topic: "schemas" }) as any).data;
      expect(data.commands).toBeDefined();
    });

    it("$defs is an object with named definitions", async () => {
      const defs = (runCommand({ topic: "schemas" }) as any).data.$defs;
      expect(typeof defs).toBe("object");
      expect(Object.keys(defs).length).toBeGreaterThan(0);
    });
  });

  describe("json flag", () => {
    it("json:true produces the same output as json:false (always JSON)", async () => {
      const withJson = runCommand({ topic: "guide", json: true }) as any;
      const withoutJson = runCommand({ topic: "guide", json: false }) as any;
      // Both should be valid JSON objects
      expect(withJson.success).toBe(true);
      expect(withoutJson.success).toBe(true);
      expect(withJson.command).toBe(withoutJson.command);
    });
  });
});
