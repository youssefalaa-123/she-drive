export function calculateFare(distanceKm) {
  const hour = new Date().getHours();
  const BASE = 60;

  if (distanceKm <= 6) return BASE;

  let rate;
  if (hour >= 13 && hour < 23) rate = 10;       // 1 PM – 11 PM
  else if (hour >= 23 || hour < 10) rate = 11;  // 11 PM – 10 AM
  else rate = 9;                                  // 10 AM – 1 PM

  return Math.round(distanceKm * rate);
}

export function applyFirstRideDiscount(fare) {
  return Math.round(fare * 0.85);
}

export function splitFare(baseFare, waitTimeFee = 0, isFirstRide = false) {
  const promoDiscount = isFirstRide ? Math.round(baseFare * 0.15) : 0;
  const netBaseFare   = baseFare - promoDiscount;

  let baseDriverShare, baseAdminShare;
  if (isFirstRide) {
    baseDriverShare = netBaseFare;
    baseAdminShare  = 0;
  } else {
    baseAdminShare  = Math.round(baseFare * 0.15);
    baseDriverShare = baseFare - baseAdminShare;
  }

  // Wait time fee is always 100% driver, 0% admin
  return {
    promoDiscount,
    netBaseFare,
    driverAmount: baseDriverShare + waitTimeFee,
    adminAmount:  baseAdminShare,
    totalCharged: netBaseFare + waitTimeFee,
  };
}

export function getTimePeriodLabel() {
  const hour = new Date().getHours();
  if (hour >= 13 && hour < 23) return 'Standard (×10/km)';
  if (hour >= 23 || hour < 10) return 'Night (×11/km)';
  return 'Morning (×9/km)';
}

// ── Wait-time & cancellation fee constants ─────────────────────────────────
export const GRACE_PERIOD_MINS   = 3;    // free wait after driver arrives at pickup
export const WAIT_FEE_PER_MIN    = 1.5;  // EGP per minute billed after grace period
export const NO_SHOW_UNLOCK_MINS = 5;    // total minutes waited before driver can no-show-cancel
export const PENALTY_CANCEL_FEE  = 15;   // EGP charged when passenger cancels > 2 min after accept
export const FREE_CANCEL_SECS    = 120;  // 2-minute free window from driver acceptance (Rule A)
export const ETA_FAULT_BUFFER    = 5;    // minutes late past ETA before fee is waived (driver fault)
export const CASH_DEBT_LIMIT     = -200; // driver wallet floor — below this, cash rides are blocked
