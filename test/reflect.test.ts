import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { reflectOnSession, deduplicateDeltas } from "../src/reflect.js"; // Internal export for testing
import { createTestConfig, createTestDiary, createTestPlaybook, createTestBullet } from "./helpers/factories.js";
import { PlaybookDelta } from "../src/types.js";
import { __resetReflectorStubsForTest } from "../src/llm.js";

describe("reflectOnSession", () => {
  const config = createTestConfig();

  beforeEach(() => {
    __resetReflectorStubsForTest();
    delete process.env.CM_REFLECTOR_STUBS;
  });

  afterEach(() => {
    __resetReflectorStubsForTest();
    delete process.env.CM_REFLECTOR_STUBS;
  });
  
  test.serial("should terminate when no new insights found", async () => {
    const diary = createTestDiary();
    const playbook = createTestPlaybook();
    
    // Stub reflector with empty list
    process.env.CM_REFLECTOR_STUBS = JSON.stringify([{ deltas: [] }]);

    const result = await reflectOnSession(diary, playbook, config);
    const deltas = Array.isArray(result) ? result : result.deltas ?? [];
    
    expect(deltas).toEqual([]);
  });

  test.serial("should aggregate unique deltas across iterations", async () => {
    const diary = createTestDiary();
    const playbook = createTestPlaybook();
    
    // Iteration 1 returns A
    // Iteration 2 returns B
    // Iteration 3 returns A (duplicate)
    
    const deltaA: PlaybookDelta = { 
      type: "add", 
      bullet: { content: "Rule A", category: "test" },
      reason: "reason A",
      sourceSession: diary.sessionPath
    };
    
    const deltaB: PlaybookDelta = { 
      type: "add", 
      bullet: { content: "Rule B", category: "test" },
      reason: "reason B",
      sourceSession: diary.sessionPath
    };

    process.env.CM_REFLECTOR_STUBS = JSON.stringify([
      { deltas: [deltaA] },
      { deltas: [deltaB] },
      { deltas: [deltaA] }
    ]);

    const result = await reflectOnSession(diary, playbook, config);
    const deltas = Array.isArray(result) ? result : result.deltas ?? [];
    
    expect(deltas).toHaveLength(2);
    expect(deltas.map(d => d.type === 'add' ? d.bullet.content : '')).toContain("Rule A");
    expect(deltas.map(d => d.type === 'add' ? d.bullet.content : '')).toContain("Rule B");
  });

  test.serial("should stop if max iterations reached", async () => {
    const diary = createTestDiary();
    const playbook = createTestPlaybook();
    
    process.env.CM_REFLECTOR_STUBS = JSON.stringify([
      { deltas: [{ type: "add", bullet: { content: "Unique", category: "test" }, reason: "reason", sourceSession: diary.sessionPath }] },
      { deltas: [{ type: "add", bullet: { content: "Another", category: "test" }, reason: "reason", sourceSession: diary.sessionPath }] },
    ]);

    const result = await reflectOnSession(diary, playbook, { ...config, maxReflectorIterations: 2 });
    const deltas = Array.isArray(result) ? result : result.deltas ?? [];
    expect(deltas.length).toBeGreaterThanOrEqual(2);
  });
});

describe("deduplicateDeltas", () => {
  test.serial("should filter exact duplicates", () => {
    const delta: PlaybookDelta = {
      type: "add",
      bullet: { content: "content", category: "cat" },
      reason: "reason",
      sourceSession: "s1"
    };
    
    const existing = [delta];
    const newDeltas = [delta];
    
    const result = deduplicateDeltas(newDeltas, existing);
    expect(result).toHaveLength(0);
  });

  test.serial("should filter duplicates by content hash for adds", () => {
    const d1: PlaybookDelta = {
      type: "add",
      bullet: { content: "Same Content", category: "cat1" },
      reason: "r1",
      sourceSession: "s1"
    };
    
    const d2: PlaybookDelta = {
      type: "add",
      bullet: { content: "same content", category: "cat2" }, // distinct case
      reason: "r2",
      sourceSession: "s2"
    };
    
    const result = deduplicateDeltas([d2], [d1]);
    expect(result).toHaveLength(0); // Should match case-insensitive
  });

  test.serial("should allow distinct adds", () => {
    const d1: PlaybookDelta = {
      type: "add",
      bullet: { content: "A", category: "c" },
      reason: "r",
      sourceSession: "s"
    };
    const d2: PlaybookDelta = {
      type: "add",
      bullet: { content: "B", category: "c" },
      reason: "r",
      sourceSession: "s"
    };
    
    const result = deduplicateDeltas([d2], [d1]);
    expect(result).toHaveLength(1);
  });
});
