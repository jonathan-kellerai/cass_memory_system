import { describe, expect, test } from "bun:test";
import { createTestPlaybook, createTestBullet, createTestConfig, createTestFeedbackEvent } from "./helpers/factories.js";
import { computePlaybookStats, __test as serveTest } from "../src/commands/serve.js";

describe("serve module stats (unit)", () => {
  const config = createTestConfig();

  test("computePlaybookStats returns counts, distribution, top performers, and staleness", async () => {
    const helpfulBullet = createTestBullet({
      maturity: "established",
      scope: "global",
      feedbackEvents: [createTestFeedbackEvent("helpful", 0)]
    });

    const harmfulBullet = createTestBullet({
      maturity: "established",
      scope: "global",
      feedbackEvents: [createTestFeedbackEvent("harmful", 0)]
    });

    // Stale bullet: no feedback, created long ago
    const staleBullet = createTestBullet({
      maturity: "candidate", // Default
      scope: "global",
      feedbackEvents: [],
      createdAt: new Date(Date.now() - 100 * 86_400_000).toISOString()
    });

    const playbook = createTestPlaybook([helpfulBullet, harmfulBullet, staleBullet]);
    const stats = computePlaybookStats(playbook, config);

    expect(stats.total).toBe(3);
    expect(stats.byScope.global).toBe(3);
    expect(stats.scoreDistribution).toEqual(
      expect.objectContaining({
        excellent: expect.any(Number),
        good: expect.any(Number),
        neutral: expect.any(Number),
        atRisk: expect.any(Number),
      })
    );
    expect(Array.isArray(stats.topPerformers)).toBe(true);
    expect(stats.topPerformers.length).toBeLessThanOrEqual(5);
    expect(stats.staleCount).toBeGreaterThanOrEqual(1);
  });

  test("routeRequest supports tools/list and rejects unsupported methods", async () => {
    const list = await serveTest.routeRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect("result" in list ? list.result?.tools?.length : 0).toBeGreaterThan(0);

    const unsupported = await serveTest.routeRequest({ jsonrpc: "2.0", id: 2, method: "nope" });
    expect("error" in unsupported).toBe(true);
    if ("error" in unsupported) {
      expect(unsupported.error.code).toBe(-32601);
    }
  });
});
