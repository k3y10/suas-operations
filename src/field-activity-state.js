const ACTIVE_MISSIONS = new Set(['approved','queued','starting','running','unknown']);
const ACTIVE_ACTIONS = new Set(['approved','queued','executing']);

export function reportsLocked(review, busy = false) {
  return busy || ACTIVE_MISSIONS.has(review?.runtime?.status) ||
    ACTIVE_ACTIONS.has(review?.runtime?.action_status);
}
