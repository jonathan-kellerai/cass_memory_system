import { describe, it, expect } from "bun:test";
import { getEffectiveScore } from "../src/scoring.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { PlaybookBullet } from "../src/types.js";

const baseBullet: PlaybookBullet = {
  id: "b-test",
  scope: "global",
  category: "testing",
  content: "Test rule",
  type: "rule",
  isNegative: false,
  kind: "workflow_rule",
  state: "active",
  maturity: "candidate",
  helpfulCount: 0,
  harmfulCount: 0,
  feedbackEvents: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pinned: false,
  deprecated: false,
  deprecatedAt: undefined,
  replacedBy: undefined,
  deprecationReason: undefined,
  sourceSessions: [],
  sourceAgents: [],
  confidenceDecayHalfLifeDays: 90,
  tags: [],
};

describe("scoring with decayedValue weighting", () => {
  it("applies decayedValue multiplier to helpful and harmful events", () => {
    const bullet: PlaybookBullet = {
      ...baseBullet,
      feedbackEvents: [
        { type: "helpful", timestamp: new Date().toISOString(), decayedValue: 0.5 },
        { type: "harmful", timestamp: new Date().toISOString(), decayedValue: 0.25 },
      ],
    };

    const score = getEffectiveScore(bullet, DEFAULT_CONFIG);
    // helpful: 0.5, harmful: 0.25 * 4 multiplier = 1 → raw -0.5, maturity multiplier 0.5 = -0.25
    expect(score).toBeCloseTo(-0.25, 5);
  });

  it("defaults decayedValue to 1 when not provided", () => {
    const bullet: PlaybookBullet = {
      ...baseBullet,
      feedbackEvents: [
        { type: "helpful", timestamp: new Date().toISOString() },
      ],
    };

    const score = getEffectiveScore(bullet, DEFAULT_CONFIG);
    expect(score).toBeGreaterThan(0);
  });
});

