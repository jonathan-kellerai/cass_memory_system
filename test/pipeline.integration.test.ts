import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { reflectOnSession } from "../src/reflect.js";
import { curatePlaybook } from "../src/curate.js";
import { createTestConfig, createTestPlaybook } from "./helpers/factories.js";
import { DiaryEntrySchema } from "../src/types.js";
import { __resetReflectorStubsForTest } from "../src/llm.js";

const diaryFixturePath = path.join(process.cwd(), "test/fixtures/diary-success.json");

describe("Pipeline integration: diary -> reflect -> curate (stubbed LLM)", () => {
  // Ensure no lingering module mocks from other suites
  mock.restore();

  beforeEach(() => {
    __resetReflectorStubsForTest();
  });

  afterEach(() => {
    delete process.env.CM_REFLECTOR_STUBS;
    __resetReflectorStubsForTest();
  });

  test("applies unique add deltas into playbook", async () => {
    const diaryRaw = JSON.parse(fs.readFileSync(diaryFixturePath, "utf-8"));
    const diary = DiaryEntrySchema.parse(diaryRaw);
    const playbook = createTestPlaybook();
    const config = createTestConfig({ maxReflectorIterations: 3 });

    process.env.CM_REFLECTOR_STUBS = JSON.stringify([
      {
        deltas: [
          { type: "add", bullet: { content: "Rule A", category: "testing" }, reason: "iter1", sourceSession: diary.sessionPath }
        ]
      },
      {
        deltas: [
          { type: "add", bullet: { content: "Rule B", category: "testing" }, reason: "iter2", sourceSession: diary.sessionPath }
        ]
      },
      {
        deltas: [
          { type: "add", bullet: { content: "Rule A", category: "testing" }, reason: "dup", sourceSession: diary.sessionPath }
        ]
      }
    ]);

    const deltas = await reflectOnSession(diary, playbook, config);
    const curation = curatePlaybook(playbook, deltas, config);

    expect(deltas).toHaveLength(2);
    expect(curation.applied).toBeGreaterThanOrEqual(1);
    expect(curation.playbook.bullets.length).toBeGreaterThanOrEqual(1);
    const contents = curation.playbook.bullets.map(b => b.content);
    expect(contents).toContain("Rule A");
  });
});
