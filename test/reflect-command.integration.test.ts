import { describe, it, expect, afterEach, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";

import * as actualDiary from "../src/diary.js";
import * as actualReflect from "../src/reflect.js";
import * as actualValidate from "../src/validate.js";
import * as actualCurate from "../src/curate.js";
import * as actualCass from "../src/cass.js";

import { createTestBullet } from "./helpers/factories.js";
import { withTempCassHome, writeFileInDir } from "./helpers/temp.js";
import { createEmptyPlaybook } from "../src/playbook.js";
import { getProcessedLogPath } from "../src/tracking.js";
import { mock } from "bun:test";

const mockDiary = {
  id: "diary-1",
  sessionPath: "SESSION",
  timestamp: new Date().toISOString(),
  agent: "tester",
  workspace: "default",
  status: "success",
  accomplishments: [],
  decisions: [],
  challenges: [],
  preferences: [],
  keyLearnings: [],
  tags: [],
  searchAnchors: [],
  relatedSessions: [],
};

const mockDelta =           {
            type: "add",
            bullet: { content: "Reflect Rule", category: "testing" },
            reason: "stubbed reflection"
          };

const curatedPlaybook = createEmptyPlaybook("integration");
curatedPlaybook.bullets = [createTestBullet({ content: mockDelta.bullet.content, category: mockDelta.bullet.category })];

describe("reflectCommand integration", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    // Restore real modules so later tests see actual implementations
    mock.module("../src/diary.js", () => actualDiary);
    mock.module("../src/reflect.js", () => actualReflect);
    mock.module("../src/validate.js", () => actualValidate);
    mock.module("../src/curate.js", () => actualCurate);
    mock.module("../src/cass.js", () => actualCass);
    mock.restore();
  });

  it.serial("processes a provided session, writes playbook, and records processed log", async () => {
    await withTempCassHome(async (env) => {
      process.chdir(env.home);

      // Seed empty playbook at default path
      await fs.mkdir(path.dirname(env.playbookPath), { recursive: true });
      await fs.writeFile(env.playbookPath, yaml.stringify(createEmptyPlaybook("integration-test")));

      // Create a fake session file
      const sessionPath = await writeFileInDir(env.home, "sessions/session-1.jsonl", "dummy session content");

      // Patch mocks to use this session path
      mockDiary.sessionPath = sessionPath;
      (mockDelta as any).sourceSession = sessionPath;

      // Setup scoped mocks for heavy dependencies
      const mockGenerateDiary = mock(() => ({ ...mockDiary }));
      const mockReflectOnSession = mock(() => [mockDelta]);
      const mockValidateDelta = mock(async () => ({ valid: true }));
      const mockCuratePlaybook = mock(() => ({
        applied: 1,
        skipped: 0,
        inversions: [],
        promotions: [],
        playbook: curatedPlaybook,
      }));

      mock.module("../src/diary.js", () => ({
        generateDiary: mockGenerateDiary,
      }));

      mock.module("../src/reflect.js", () => ({
        reflectOnSession: mockReflectOnSession,
      }));

      mock.module("../src/validate.js", () => ({
        validateDelta: mockValidateDelta,
      }));

      mock.module("../src/curate.js", () => ({
        curatePlaybook: mockCuratePlaybook,
      }));

      mock.module("../src/cass.js", () => ({
        findUnprocessedSessions: async () => [],
        cassExport: async () => "this is synthetic session content that is definitely more than fifty characters long",
        cassExpand: async () => "expanded context",
        cassTimeline: async () => ({ groups: [] }),
        cassAvailable: () => true,
        cassSearch: async () => [],
        cassStats: async () => null,
        cassIndex: async () => undefined,
        safeCassSearch: async () => [],
      }));

      const { reflectCommand } = await import("../src/commands/reflect.js");

      await reflectCommand({ session: sessionPath, json: true });

      // Verify playbook was updated with curated bullet
      const saved = yaml.parse(await fs.readFile(env.playbookPath, "utf-8"));
      const contents = (saved.bullets || []).map((b: any) => b.content);
      expect(contents).toContain("Reflect Rule");

      // Verify processed log captured the session
      const logPath = getProcessedLogPath();
      const logContent = await fs.readFile(logPath, "utf-8");
      expect(logContent).toContain(sessionPath);
    });
  });
});

afterAll(() => {
  mock.restore();
});
