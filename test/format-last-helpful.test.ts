import { describe, expect, it } from "bun:test";
import { formatLastHelpful } from "../src/utils.js";

describe("formatLastHelpful", () => {
  // Helper to create timestamp N units ago
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000).toISOString();
  const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const weeksAgo = (n: number) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthsAgo = (n: number) => new Date(Date.now() - n * 30 * 24 * 60 * 60 * 1000).toISOString();
  const yearsAgo = (n: number) => new Date(Date.now() - n * 365 * 24 * 60 * 60 * 1000).toISOString();

  it("returns 'Never' for empty bullet", () => {
    expect(formatLastHelpful({})).toBe("Never");
  });

  it("returns 'Never' for bullet with empty arrays", () => {
    expect(formatLastHelpful({ helpfulEvents: [] })).toBe("Never");
    expect(formatLastHelpful({ feedbackEvents: [] })).toBe("Never");
  });

  it("returns 'just now' for very recent events", () => {
    const bullet = {
      helpfulEvents: [{ timestamp: new Date().toISOString() }]
    };
    expect(formatLastHelpful(bullet)).toBe("just now");
  });

  it("formats minutes correctly", () => {
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: minutesAgo(1) }] })).toBe("1 minute ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: minutesAgo(5) }] })).toBe("5 minutes ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: minutesAgo(45) }] })).toBe("45 minutes ago");
  });

  it("formats hours correctly", () => {
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: hoursAgo(1) }] })).toBe("1 hour ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: hoursAgo(3) }] })).toBe("3 hours ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: hoursAgo(23) }] })).toBe("23 hours ago");
  });

  it("formats days correctly", () => {
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: daysAgo(1) }] })).toBe("1 day ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: daysAgo(2) }] })).toBe("2 days ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: daysAgo(6) }] })).toBe("6 days ago");
  });

  it("formats weeks correctly", () => {
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: weeksAgo(1) }] })).toBe("1 week ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: weeksAgo(2) }] })).toBe("2 weeks ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: weeksAgo(3) }] })).toBe("3 weeks ago");
  });

  it("formats months correctly", () => {
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: monthsAgo(1) }] })).toBe("1 month ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: monthsAgo(5) }] })).toBe("5 months ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: monthsAgo(11) }] })).toBe("11 months ago");
  });

  it("formats years correctly", () => {
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: yearsAgo(1) }] })).toBe("1 year ago");
    expect(formatLastHelpful({ helpfulEvents: [{ timestamp: yearsAgo(2) }] })).toBe("2 years ago");
  });

  it("finds most recent event from helpfulEvents array", () => {
    const bullet = {
      helpfulEvents: [
        { timestamp: daysAgo(10) },
        { timestamp: daysAgo(2) },  // Most recent
        { timestamp: daysAgo(5) }
      ]
    };
    expect(formatLastHelpful(bullet)).toBe("2 days ago");
  });

  it("extracts helpful events from feedbackEvents array", () => {
    const bullet = {
      feedbackEvents: [
        { type: "harmful", timestamp: hoursAgo(1) },
        { type: "helpful", timestamp: daysAgo(3) },
        { type: "helpful", timestamp: daysAgo(1) },  // Most recent helpful
        { type: "harmful", timestamp: minutesAgo(30) }
      ]
    };
    expect(formatLastHelpful(bullet)).toBe("1 day ago");
  });

  it("prefers helpfulEvents over feedbackEvents", () => {
    const bullet = {
      helpfulEvents: [{ timestamp: hoursAgo(1) }],  // Should use this (more recent)
      feedbackEvents: [{ type: "helpful", timestamp: daysAgo(5) }]
    };
    expect(formatLastHelpful(bullet)).toBe("1 hour ago");
  });

  it("handles invalid timestamps gracefully", () => {
    const bullet = {
      helpfulEvents: [
        { timestamp: "invalid-date" },
        { timestamp: daysAgo(2) }  // Valid
      ]
    };
    expect(formatLastHelpful(bullet)).toBe("2 days ago");
  });

  it("returns 'Never' if all timestamps are invalid", () => {
    const bullet = {
      helpfulEvents: [
        { timestamp: "not-a-date" },
        { timestamp: "" }
      ]
    };
    expect(formatLastHelpful(bullet)).toBe("Never");
  });

  it("returns 'Never' if feedbackEvents has no helpful type", () => {
    const bullet = {
      feedbackEvents: [
        { type: "harmful", timestamp: hoursAgo(1) },
        { type: "harmful", timestamp: daysAgo(1) }
      ]
    };
    expect(formatLastHelpful(bullet)).toBe("Never");
  });
});
