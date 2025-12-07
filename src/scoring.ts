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
  
  if (isNaN(eventDate.getTime())) {
    // If invalid date, assume it's brand new to be safe? Or ignore?
    // Safer to return 0 so it doesn't affect score if data is corrupt.
    return 0;
  }

  const ageMs = now.getTime() - eventDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  // Exponential decay: value = 1 * (0.5)^(age/halfLife)
  // Clamp age to 0 to prevent future events from having massive value
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
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
  
  const maturityMultiplier: Record<BulletMaturity, number> = {
    candidate: 0.5,
    established: 1.0,
    proven: 1.5,
    deprecated: 0
  };

  const multiplier = maturityMultiplier[bullet.maturity] ?? 1.0;
  
  // Type-safe state multiplier
  const stateMultiplier = {
    draft: 0.8,
    active: 1.0,
    retired: 0.1
  }[bullet.state] || 1.0;

  return rawScore * multiplier * stateMultiplier;
}

// --- Maturity State Machine ---

export function calculateMaturityState(
  bullet: PlaybookBullet, 
  config: Config
): BulletMaturity {
  if (bullet.maturity === "deprecated" || bullet.deprecated) return "deprecated";

  const { decayedHelpful, decayedHarmful } = getDecayedCounts(bullet, config);
  const total = decayedHelpful + decayedHarmful;
  const harmfulRatio = total > 0 ? decayedHarmful / total : 0;
  
  if (harmfulRatio > 0.3 && total > 2) return "deprecated"; 
  if (total < 3) return "candidate";                        
  if (decayedHelpful >= 10 && harmfulRatio < 0.1) return "proven";
  
  return "established";
}

// --- Lifecycle Checks ---

export function checkForPromotion(bullet: PlaybookBullet, config: Config): BulletMaturity {
  const current = bullet.maturity;
  if (current === "proven" || current === "deprecated") return current;
  
  const newState = calculateMaturityState(bullet, config);
  
  const isPromotion = 
    (current === "candidate" && (newState === "established" || newState === "proven")) ||
    (current === "established" && newState === "proven");

  return isPromotion ? newState : current;
}

export function checkForDemotion(bullet: PlaybookBullet, config: Config): BulletMaturity | "auto-deprecate" {
  if (bullet.pinned) return bullet.maturity;
  
  const score = getEffectiveScore(bullet, config);
  
  if (score < -config.pruneHarmfulThreshold) {
    return "auto-deprecate";
  }
  
  if (score < 0) {
    if (bullet.maturity === "proven") return "established";
    if (bullet.maturity === "established") return "candidate";
  }
  
  return bullet.maturity;
}

export function isStale(bullet: PlaybookBullet, staleDays = 90): boolean {
  const allEvents = bullet.feedbackEvents;
  if (allEvents.length === 0) {
    const created = new Date(bullet.createdAt).getTime();
    if (isNaN(created)) return false; // Fail safe
    return (Date.now() - created) > (staleDays * 86400000);
  }
  
  const lastTs = Math.max(...allEvents.map(e => {
    const t = new Date(e.timestamp).getTime();
    return isNaN(t) ? 0 : t;
  }));
  
  if (lastTs === 0) return false;

  return (Date.now() - lastTs) > (staleDays * 86400000);
}