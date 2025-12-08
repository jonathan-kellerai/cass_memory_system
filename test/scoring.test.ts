import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  calculateDecayedValue,
  getDecayedScore,
  getDecayedCounts,
  getEffectiveScore,
  calculateMaturityState,
  checkForPromotion,
  checkForDemotion,
  isStale,
  analyzeScoreDistribution,
} from "../src/scoring.js";
import { getDefaultConfig } from "../src/config.js";
import { PlaybookBullet } from "../src/types.js";

const fixedNow = new Date("2025-01-01T00:00:00.000Z").getTime();
let OriginalDate: DateConstructor;

beforeEach(() => {
  OriginalDate = Date;
  // Patch Date so both Date.now() and new Date() use fixedNow by default
  // while still allowing explicit construction with args.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.Date = class extends OriginalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        return new OriginalDate(fixedNow);
      }
      return new OriginalDate(...(args as ConstructorParameters<typeof OriginalDate>));
    }
    static now() {
      return fixedNow;
    }
  };
});

afterEach(() => {
  // Restore native Date
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.Date = OriginalDate;
});

function makeBullet(overrides: Partial<PlaybookBullet> = {}): PlaybookBullet {
  const base: PlaybookBullet = {
    id: "b-test",
    scope: "global",
    category: "test",
    content: "Base rule content",
    type: "rule",
    isNegative: false,
    kind: "stack_pattern",
    state: "active",
    maturity: "candidate",
    helpfulCount: 0,
    harmfulCount: 0,
    feedbackEvents: [],
    helpfulEvents: [],
    harmfulEvents: [],
    confidenceDecayHalfLifeDays: 90,
    createdAt: new Date(fixedNow).toISOString(),
    updatedAt: new Date(fixedNow).toISOString(),
    pinned: false,
    deprecated: false,
    sourceSessions: [],
    sourceAgents: [],
    tags: [],
  };
  return { ...base, ...overrides };
}

function daysAgoIso(days: number) {
  return new Date(fixedNow - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("scoring decay functions", () => {
  it("calculateDecayedValue halves at one half-life", () => {
    const event = { type: "helpful" as const, timestamp: daysAgoIso(90) };
    const value = calculateDecayedValue(event, new Date(fixedNow), 90);
    expect(value).toBeCloseTo(0.5, 4);
  });

  it("getDecayedCounts aggregates helpful and harmful with half-life", () => {
    const bullet = makeBullet({
      feedbackEvents: [
        { type: "helpful", timestamp: daysAgoIso(0) },
        { type: "helpful", timestamp: daysAgoIso(90) }, // decays to 0.5
        { type: "harmful", timestamp: daysAgoIso(0) },
      ],
    });
    const config = getDefaultConfig();
    const { decayedHelpful, decayedHarmful } = getDecayedCounts(bullet, config);
    expect(decayedHelpful).toBeCloseTo(1.5, 4);
    expect(decayedHarmful).toBeCloseTo(1.0, 4);
  });
});

describe("effective score and maturity", () => {
  it("computes effective score with maturity multiplier", () => {
    const bullet = makeBullet({
      maturity: "candidate",
      feedbackEvents: [
        { type: "helpful", timestamp: daysAgoIso(0) },
        { type: "helpful", timestamp: daysAgoIso(90) },
        { type: "harmful", timestamp: daysAgoIso(0) },
      ],
    });
    const config = getDefaultConfig();
    const score = getEffectiveScore(bullet, config);
    // raw = 1.5 - 4*1 = -2.5, candidate multiplier 0.5 => -1.25
    expect(score).toBeCloseTo(-1.25, 3);
  });

  it("promotes to proven when helpful evidence is strong", () => {
    const events = Array.from({ length: 12 }, () => ({ type: "helpful" as const, timestamp: daysAgoIso(1) }));
    const bullet = makeBullet({ maturity: "candidate", feedbackEvents: events });
    const config = getDefaultConfig();
    const maturity = calculateMaturityState(bullet, config);
    expect(maturity).toBe("proven");
    expect(checkForPromotion(bullet, config)).toBe("proven");
  });

  it("auto-deprecates when score far below harmful threshold", () => {
    const harmfulEvents = [
      { type: "harmful" as const, timestamp: daysAgoIso(0) },
      { type: "harmful" as const, timestamp: daysAgoIso(0) },
      { type: "harmful" as const, timestamp: daysAgoIso(0) },
    ];
    const bullet = makeBullet({ feedbackEvents: harmfulEvents, maturity: "established" });
    const config = getDefaultConfig();
    const result = checkForDemotion(bullet, config);
    expect(result).toBe("auto-deprecate");
  });

  it("does not demote pinned bullets", () => {
    const bullet = makeBullet({ pinned: true, maturity: "proven", feedbackEvents: [{ type: "harmful", timestamp: daysAgoIso(0) }] });
    const config = getDefaultConfig();
    expect(checkForDemotion(bullet, config)).toBe("proven");
  });
});

describe("staleness and distribution", () => {
  it("detects stale bullets without feedback", () => {
    const bullet = makeBullet({ createdAt: daysAgoIso(200) });
    expect(isStale(bullet, 90)).toBe(true);
  });

  it("is not stale if recent feedback exists", () => {
    const bullet = makeBullet({
      createdAt: daysAgoIso(200),
      feedbackEvents: [{ type: "helpful", timestamp: daysAgoIso(1) }],
    });
    expect(isStale(bullet, 90)).toBe(false);
  });

  it("analyzes score distribution buckets", () => {
    const config = getDefaultConfig();
    const bullets = [
      makeBullet({ id: "b1", feedbackEvents: [{ type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }] }), // high score
      makeBullet({ id: "b2", feedbackEvents: [{ type: "helpful", timestamp: daysAgoIso(0) }, { type: "helpful", timestamp: daysAgoIso(0) }] }), // good/neutral
      makeBullet({ id: "b3", feedbackEvents: [] }), // neutral/low
      makeBullet({ id: "b4", feedbackEvents: [{ type: "harmful", timestamp: daysAgoIso(0) }] }), // atRisk
    ];
    const dist = analyzeScoreDistribution(bullets, config);
    expect(dist.excellent + dist.good + dist.neutral + dist.atRisk).toBe(4);
    expect(dist.atRisk).toBeGreaterThanOrEqual(1);
  });
});
