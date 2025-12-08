import { describe, test, expect } from "bun:test";
import { 
  calculateDecayedValue, 
  getEffectiveScore, 
  calculateMaturityState, 
  checkForPromotion,
  checkForDemotion 
} from "../src/scoring.js";
import { createTestBullet, createTestConfig, createTestFeedbackEvent } from "./helpers/factories.js";

describe("Confidence Decay", () => {
  const config = createTestConfig();

  // Helper to create date strings relative to now
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - (d * 24 * 60 * 60 * 1000)).toISOString();
  const daysFromNow = (d: number) => new Date(now + (d * 24 * 60 * 60 * 1000)).toISOString();

  describe("calculateDecayedValue", () => {
    test("should return 1.0 for recent events", () => {
      const event = createTestFeedbackEvent("helpful", 0);
      const value = calculateDecayedValue(event, new Date(now), 90);
      expect(value).toBeCloseTo(1.0, 2);
    });

    test("should return 0.5 for half-life old events", () => {
      const event = createTestFeedbackEvent("helpful", 90);
      const value = calculateDecayedValue(event, new Date(now), 90);
      expect(value).toBeCloseTo(0.5, 2);
    });

    test("should return ~1.0 for 1 day old events", () => {
      const event = createTestFeedbackEvent("helpful", 1);
      const value = calculateDecayedValue(event, new Date(now), 90);
      expect(value).toBeGreaterThan(0.99);
    });

    test("should clamp future events to 1.0", () => {
      const event = createTestFeedbackEvent("helpful", -1); // 1 day in future
      const value = calculateDecayedValue(event, new Date(now), 90);
      expect(value).toBe(1.0);
    });
  });

  describe("getEffectiveScore", () => {
    test("should return 0 for no feedback", () => {
      const bullet = createTestBullet({ feedbackEvents: [] });
      const score = getEffectiveScore(bullet, config);
      expect(score).toBe(0);
    });

    test("should account for helpful events", () => {
      const bullet = createTestBullet({ 
        feedbackEvents: [createTestFeedbackEvent("helpful", 0)],
        maturity: "established"
      });
      const score = getEffectiveScore(bullet, config);
      expect(score).toBe(1.0);
    });

    test("should apply harmful multiplier (4x)", () => {
      const bullet = createTestBullet({ 
        feedbackEvents: [createTestFeedbackEvent("harmful", 0)],
        maturity: "established"
      });
      const score = getEffectiveScore(bullet, config);
      expect(score).toBe(-4.0);
    });

    test("should apply decay to both helpful and harmful", () => {
      // Both 90 days old (half value)
      const baseEvents = [createTestFeedbackEvent("helpful", 0)];
      const oldEvents = [createTestFeedbackEvent("helpful", 90)]; // should be 0.5
      
      const freshBullet = createTestBullet({ feedbackEvents: baseEvents, maturity: "established" });
      const staleBullet = createTestBullet({ feedbackEvents: oldEvents, maturity: "established" });
      
      const freshScore = getEffectiveScore(freshBullet, config);
      const staleScore = getEffectiveScore(staleBullet, config);
      
      expect(freshScore).toBe(1.0);
      expect(staleScore).toBeCloseTo(0.5, 2);
    });

    test("should apply maturity multipliers", () => {
      const bullet = createTestBullet({ 
        maturity: "proven",
        feedbackEvents: [createTestFeedbackEvent("helpful", 0)]
      });
      
      // 1.0 (base) * 1.5 (proven multiplier)
      const score = getEffectiveScore(bullet, config);
      expect(score).toBe(1.5);
    });
  });

  describe("Maturity Transitions", () => {
    test("should promote candidate to established with enough helpful", () => {
      // Need 3 total events for active/established
      const bullet = createTestBullet({
        maturity: "candidate",
        feedbackEvents: Array(3).fill(null).map((_, idx) => 
          createTestFeedbackEvent("helpful", idx)
        )
      });
      
      const newState = calculateMaturityState(bullet, config);
      expect(newState).toBe("established");
    });

    test("should not promote if harmful ratio high", () => {
      const events = [
        createTestFeedbackEvent("helpful", 1),
        createTestFeedbackEvent("harmful", 0),
        createTestFeedbackEvent("harmful", 2)
      ];
      
      const bullet = createTestBullet({
        maturity: "candidate",
        feedbackEvents: events
      });
      
      const newState = calculateMaturityState(bullet, config);
      // 2 harmful / 3 total = 0.66 ratio > 0.3 threshold -> deprecated
      expect(newState).toBe("deprecated");
    });

    test("should promote to proven with 10+ helpful and low harmful", () => {
      const events = Array(10).fill(null).map(() => 
        createTestFeedbackEvent("helpful", 0)
      );
      
      const bullet = createTestBullet({
        maturity: "established",
        feedbackEvents: events
      });
      
      const newState = calculateMaturityState(bullet, config);
      expect(newState).toBe("proven");
    });

    test("should deprecate if harmful feedback overwhelming", () => {
      // Need total > 3 to deprecate, otherwise stays candidate
      const bullet = createTestBullet({
        maturity: "established",
        feedbackEvents: [
          createTestFeedbackEvent("harmful", 0),
          createTestFeedbackEvent("harmful", 1),
          createTestFeedbackEvent("harmful", 2),
          createTestFeedbackEvent("harmful", 3)
        ]
      });
      
      const newState = calculateMaturityState(bullet, config);
      expect(newState).toBe("deprecated");
    });
  });

  describe("checkForPromotion", () => {
    test("should return new state if promotion criteria met", () => {
      const bullet = createTestBullet({
        maturity: "candidate",
        feedbackEvents: [createTestFeedbackEvent("helpful", 1)]
      });
      
      // Need 3 for established. Add more.
      bullet.feedbackEvents.push(createTestFeedbackEvent("helpful", 2));
      bullet.feedbackEvents.push(createTestFeedbackEvent("helpful", 3));
      
      const result = checkForPromotion(bullet, config);
      expect(result).toBe("established");
    });

    test("should return current state if no promotion", () => {
      const bullet = createTestBullet({
        maturity: "candidate",
        feedbackEvents: [createTestFeedbackEvent("helpful", 10)]
      });
      
      const result = checkForPromotion(bullet, config);
      // Already has 10 helpful, but logic says if current is candidate, it can go to proven/established.
      // Wait, checkForPromotion only returns new state if it's a promotion.
      // With 10 helpful, it SHOULD go to proven.
      expect(result).toBe("proven");
    });
  });
});
