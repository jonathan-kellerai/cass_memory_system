import { 
  Config, 
  PlaybookBullet, 
  FeedbackEvent,
  BulletMaturity
} from "./types.js";

// --- Decay Core ---

export function calculateDecayedValue(
  event: FeedbackEvent,
  now: Date,
  halfLifeDays = 90
): number {
  const eventDate = new Date(event.timestamp);
  const ageMs = now.getTime() - eventDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  // Exponential decay: value = 1 * (0.5)^(age/halfLife)
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function getDecayedCounts(
  bullet: PlaybookBullet, 
  config: Config
): { decayedHelpful: number; decayedHarmful: number } {
  const now = new Date();
  let decayedHelpful = 0;
  let decayedHarmful = 0;
  
  for (const event of bullet.feedbackEvents) {
    const val = calculateDecayedValue(event, now, config.defaultDecayHalfLife);
    if (event.type === "helpful") decayedHelpful += val;
    else decayedHarmful += val;
  }
  
  return { decayedHelpful, decayedHarmful };
}

// --- Effective Score ---

export function getEffectiveScore(
  bullet: PlaybookBullet, 
  config: Config
): number {
  const { decayedHelpful, decayedHarmful } = getDecayedCounts(bullet, config);
  
  // Key insight: harmful feedback weighs 4x more than helpful
  const rawScore = decayedHelpful - (4 * decayedHarmful);
  
  // Maturity multiplier
  const maturityMultiplier = {
    draft: 0.8,
    active: 1.0,
    retired: 0.1
  }[bullet.state] || 1.0;
  
  // Bonus for proven maturity
  const provenBonus = bullet.maturity === "proven" ? 1.2 : 1.0;
  
  return rawScore * maturityMultiplier * provenBonus;
}

// --- Maturity State Machine ---

export function calculateMaturityState(
  bullet: PlaybookBullet, 
  config: Config
): BulletMaturity {
  // If explicitly deprecated, stay deprecated
  if (bullet.maturity === "deprecated" || bullet.deprecated) return "deprecated";

  const { decayedHelpful, decayedHarmful } = getDecayedCounts(bullet, config);
  const total = decayedHelpful + decayedHarmful;
  const harmfulRatio = total > 0 ? decayedHarmful / total : 0;
  
  // Transitions
  if (harmfulRatio > 0.3 && total > 2) return "deprecated"; // Too harmful
  if (total < 3) return "candidate";                        // Not enough data
  if (decayedHelpful >= 10 && harmfulRatio < 0.1) return "proven";
  
  return "established";
}

// --- Lifecycle Checks ---

export function checkForPromotion(bullet: PlaybookBullet, config: Config): BulletMaturity {
  const current = bullet.maturity;
  if (current === "proven" || current === "deprecated") return current;
  
  const newState = calculateMaturityState(bullet, config);
  
  // Only promote, never demote via this function
  if (
    (current === "candidate" && (newState === "established" || newState === "proven")) ||
    (current === "established" && newState === "proven")
  ) {
    return newState;
  }
  
  return current;
}

export function checkForDemotion(bullet: PlaybookBullet, config: Config): BulletMaturity | "auto-deprecate" {
  if (bullet.pinned) return bullet.maturity;
  
  const score = getEffectiveScore(bullet, config);
  
  // Severe negative score -> auto-deprecate
  if (score < -config.pruneHarmfulThreshold) {
    return "auto-deprecate";
  }
  
  // Soft demotion
  if (score < 0) {
    if (bullet.maturity === "proven") return "established";
    if (bullet.maturity === "established") return "candidate";
  }
  
  return bullet.maturity;
}

export function isStale(bullet: PlaybookBullet, staleDays = 90): boolean {
  const allEvents = bullet.feedbackEvents;
  if (allEvents.length === 0) {
    // No feedback ever - check creation date
    return (Date.now() - new Date(bullet.createdAt).getTime()) > (staleDays * 86400000);
  }
  
  const lastEvent = allEvents[allEvents.length - 1]; // Assuming sorted append
  // Better: find max timestamp
  const lastTs = Math.max(...allEvents.map(e => new Date(e.timestamp).getTime()));
  
  return (Date.now() - lastTs) > (staleDays * 86400000);
}