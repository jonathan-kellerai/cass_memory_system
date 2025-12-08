import { describe, expect, it } from "bun:test";
import {
  calculateDecayedValue,
  getDecayedScore,
  getDecayedCounts,
  getEffectiveScore,
  calculateMaturityState,
  checkForPromotion,
  checkForDemotion,
  isStale,
} from "../src/scoring.js";
import {
  createBullet,
  createFeedbackEvent,
  createTestFeedbackEvent,
  daysAgo,
  daysFromNow,
} from "./helpers/factories.js";

const HALF_LIFE = 90;

describe("scoring.ts", () => {
  describe("calculateDecayedValue", () => {
    it("is ~1.0 for events today", () => {
      const v = calculateDecayedValue(new Date().toISOString(), HALF_LIFE);
      expect(v).toBeGreaterThan(0.99);
    });

    it("is ~0.5 after one half-life", () => {
      const v = calculateDecayedValue(daysAgo(90), HALF_LIFE);
      expect(v).toBeCloseTo(0.5, 2);
    });

    it("approaches 0 for very old events", () => {
      const v = calculateDecayedValue(daysAgo(365 * 5), HALF_LIFE);
      expect(v).toBeLessThan(0.05);
    });

    it("returns >1 for future dates (edge)", () => {
      const future = daysFromNow(7);
      const v = calculateDecayedValue(future, HALF_LIFE);
      expect(v).toBeGreaterThan(1);
    });
  });

  describe("getDecayedScore", () => {
    it("sums decayed values", () => {
      const events = [
        createFeedbackEvent("helpful", { timestamp: new Date().toISOString() }),
        createFeedbackEvent("helpful", { timestamp: daysAgo(90) }),
      ];
      const score = getDecayedScore(events, HALF_LIFE);
      expect(score).toBeGreaterThan(1.4); // ~1 + 0.5
    });

    it("returns 0 for no events", () => {
      expect(getDecayedScore([], HALF_LIFE)).toBe(0);
    });
  });

  describe("getDecayedCounts", () => {
    it("splits helpful/harmful with decay", () => {
      const bullet = createBullet({
        feedbackEvents: [
          createFeedbackEvent("helpful", { timestamp: new Date().toISOString() }),
          createFeedbackEvent("harmful", { timestamp: daysAgo(1) }),
        ],
      });
      const counts = getDecayedCounts(bullet, HALF_LIFE);
      expect(counts.helpful).toBeGreaterThan(counts.harmful);
      expect(counts.harmful).toBeGreaterThan(0);
    });
  });

  describe("getEffectiveScore", () => {
    const baseConfig: any = { scoring: { harmfulMultiplier: 4 }, defaultDecayHalfLife: HALF_LIFE };

    it("is 0 for new bullet with no feedback", () => {
      const bullet = createBullet({ feedbackEvents: [] });
      expect(getEffectiveScore(bullet, baseConfig)).toBe(0);
    });

    it("positive for helpful-only", () => {
      const bullet = createBullet({ feedbackEvents: [createFeedbackEvent("helpful")] });
      expect(getEffectiveScore(bullet, baseConfig)).toBeGreaterThan(0);
    });

    it("negative for harmful-only (multiplied)", () => {
      const bullet = createBullet({ feedbackEvents: [createFeedbackEvent("harmful")] });
      expect(getEffectiveScore(bullet, baseConfig)).toBeLessThan(0);
    });

    it("maturity multiplier applied", () => {
      const bullet = createBullet({
        maturity: "proven",
        feedbackEvents: [createFeedbackEvent("helpful")],
      });
      const provenScore = getEffectiveScore(bullet, baseConfig);
      const candidateScore = getEffectiveScore(
        { ...bullet, maturity: "candidate" },
        baseConfig
      );
      expect(provenScore).toBeGreaterThan(candidateScore);
    });
  });

  describe("calculateMaturityState / promotions / demotions", () => {
    const cfg: any = {
      scoring: {
        minFeedbackForActive: 3,
        minHelpfulForProven: 10,
        maxHarmfulRatioForProven: 0.1,
      },
    };

    it("promotes to established after min feedback", () => {
      const bullet = createBullet({
        maturity: "candidate",
        helpfulCount: 2,
        harmfulCount: 1,
      });
      expect(checkForPromotion(bullet, cfg)).toBe(true);
    });

    it("promotes to proven with enough helpful and low harmful ratio", () => {
      const bullet = createBullet({
        maturity: "established",
        helpfulCount: 12,
        harmfulCount: 1,
      });
      expect(calculateMaturityState(bullet, cfg)).toBe("proven");
    });

    it("demotes when harmful ratio high", () => {
      const bullet = createBullet({
        maturity: "proven",
        helpfulCount: 10,
        harmfulCount: 5,
      });
      expect(checkForDemotion(bullet, cfg)).toBe(true);
    });
  });

  describe("isStale", () => {
    it("stale when no feedback", () => {
      const bullet = createBullet({ feedbackEvents: [] });
      expect(isStale(bullet, 30)).toBe(true);
    });

    it("not stale with recent helpful", () => {
      const bullet = createBullet({
        feedbackEvents: [createFeedbackEvent("helpful", { timestamp: daysAgo(1) })],
      });
      expect(isStale(bullet, 7)).toBe(false);
    });
  });
});
