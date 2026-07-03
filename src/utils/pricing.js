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

export function splitFare(fare, isFirstRide) {
  if (isFirstRide) {
    return { driverAmount: fare, adminAmount: 0 };
  }
  const commission = Math.round(fare * 0.15);
  return { driverAmount: fare - commission, adminAmount: commission };
}

export function getTimePeriodLabel() {
  const hour = new Date().getHours();
  if (hour >= 13 && hour < 23) return 'Standard (×10/km)';
  if (hour >= 23 || hour < 10) return 'Night (×11/km)';
  return 'Morning (×9/km)';
}
