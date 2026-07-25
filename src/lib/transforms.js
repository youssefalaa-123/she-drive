// Data transformation utilities: Supabase snake_case ↔ app camelCase

const ts = (iso) => iso ? {
  toMillis: () => new Date(iso).getTime(),
  toDate:   () => new Date(iso),
  seconds:  Math.floor(new Date(iso).getTime() / 1000),
} : null;

export function toProfile(row) {
  if (!row) return null;
  return {
    uid:          row.id,
    name:         row.name,
    email:        row.email,
    phone:        row.phone,
    role:         row.role,
    wallet:       row.wallet ?? 0,
    totalTrips:   row.total_trips ?? 0,
    rating:       row.rating ?? 0,
    ratingCount:  row.rating_count ?? 0,
    approved:     row.approved ?? false,
    rejected:     row.rejected ?? false,
    isOnline:     row.is_online ?? false,
    currentLat:   row.current_lat,
    currentLng:   row.current_lng,
    photoURL:     row.photo_url,
    carPhotoURL:  row.car_photo_url,
    nationalIdPhotoURL: row.national_id_photo_url,
    licensePhotoURL:    row.license_photo_url,
    licenseNumber: row.license_number,
    nationalId:   row.national_id,
    carModel:     row.car_model,
    carColor:     row.car_color,
    plateNumber:  row.plate_number,
    savedCards:   row.saved_cards ?? [],
    payoutMethods: row.payout_methods ?? [],
    badges:        row.badges ?? 0,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastRideDate:  row.last_ride_date,
    createdAt:     ts(row.created_at),
  };
}

export function fromProfile(data) {
  const map = {
    totalTrips:  'total_trips',  isOnline:   'is_online',
    currentLat:  'current_lat',  currentLng: 'current_lng',
    photoURL:    'photo_url',    carPhotoURL: 'car_photo_url',
    carModel:    'car_model',    carColor:    'car_color',
    plateNumber: 'plate_number', licenseNumber: 'license_number',
    ratingCount: 'rating_count', savedCards:  'saved_cards',
    payoutMethods: 'payout_methods',
    nationalIdPhotoURL: 'national_id_photo_url',
    licensePhotoURL:    'license_photo_url',
    nationalId: 'national_id',
  };
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    result[map[key] || key] = value;
  }
  return result;
}

export function toRide(row) {
  if (!row) return null;
  return {
    id:               row.id,
    passengerId:      row.passenger_id,
    driverId:         row.driver_id,
    driverName:       row.driver_name,
    passengerName:    row.passenger_name,
    from:             row.from_address,
    to:               row.to_address,
    fromLat:          row.from_lat,
    fromLng:          row.from_lng,
    toLat:            row.to_lat,
    toLng:            row.to_lng,
    distanceKm:       row.distance_km,
    durationMins:     row.duration_mins,
    estimatedFare:    row.estimated_fare,
    finalFare:        row.final_fare,
    baseFare:         row.base_fare,
    cardFee:          row.card_fee ?? 0,
    paymentMethod:    row.payment_method,
    status:           row.status,
    cancelledBy:      row.cancelled_by,
    cancelReason:     row.cancel_reason,
    cancellationFee:  row.cancellation_fee ?? 0,
    isFirstRide:      row.is_first_ride ?? false,
    driverEarnings:   row.driver_earnings,
    driverLat:        row.driver_lat,
    driverLng:        row.driver_lng,
    driverPhotoURL:   row.driver_photo_url,
    driverRating:     row.driver_rating,
    driverTotalTrips: row.driver_total_trips,
    driverCar:        row.driver_car,
    driverPlate:      row.driver_plate,
    driverPhone:      row.driver_phone,
    passengerPhotoURL: row.passenger_photo_url,
    passengerPhone:    row.passenger_phone,
    waitTimeMinutes:   row.wait_time_minutes ?? 0,
    walletAmountPaid: row.wallet_amount_paid ?? 0,
    remainingAmount:  row.remaining_amount ?? 0,
    waitTimeFee:      row.wait_time_fee ?? 0,
    waitTimeStart:    ts(row.wait_time_start),
    noShow:           row.no_show ?? false,
    noShowFee:        row.no_show_fee ?? 0,
    feeWaived:        row.fee_waived ?? false,
    feeWaivedReason:  row.fee_waived_reason,
    refunded:         row.refunded ?? false,
    refundedAt:       ts(row.refunded_at),
    refundedBy:       row.refunded_by,
    commissionCredited: row.commission_credited ?? false,
    passengerSettled:   row.passenger_settled ?? false,
    driverCancellationCredited: row.driver_cancellation_credited ?? false,
    passengerRating:  row.passenger_rating,
    passengerComment: row.passenger_comment,
    ratedAt:          ts(row.rated_at),
    acceptedAt:       ts(row.accepted_at),
    arrivedAt:        ts(row.arrived_at),
    startedAt:        ts(row.started_at),
    cancelledAt:      ts(row.cancelled_at),
    completedAt:      ts(row.completed_at),
    odometerKm:       row.odometer_km ?? 0,
    actualDistanceKm: row.actual_distance_km,
    eta:              row.eta,
    pickupNote:       row.pickup_note,
    createdAt:        ts(row.created_at),
  };
}

export function fromRide(data) {
  const map = {
    passengerId:      'passenger_id',
    driverId:         'driver_id',
    driverName:       'driver_name',
    passengerName:    'passenger_name',
    from:             'from_address',
    to:               'to_address',
    fromLat:          'from_lat',
    fromLng:          'from_lng',
    toLat:            'to_lat',
    toLng:            'to_lng',
    distanceKm:       'distance_km',
    durationMins:     'duration_mins',
    estimatedFare:    'estimated_fare',
    finalFare:        'final_fare',
    baseFare:         'base_fare',
    cardFee:          'card_fee',
    paymentMethod:    'payment_method',
    cancelledBy:      'cancelled_by',
    cancelReason:     'cancel_reason',
    cancellationFee:  'cancellation_fee',
    isFirstRide:      'is_first_ride',
    driverEarnings:   'driver_earnings',
    driverLat:        'driver_lat',
    driverLng:        'driver_lng',
    driverPhotoURL:   'driver_photo_url',
    driverRating:     'driver_rating',
    driverTotalTrips: 'driver_total_trips',
    driverCar:        'driver_car',
    driverPlate:      'driver_plate',
    driverPhone:      'driver_phone',
    passengerPhotoURL: 'passenger_photo_url',
    passengerPhone:    'passenger_phone',
    waitTimeMinutes:   'wait_time_minutes',
    walletAmountPaid: 'wallet_amount_paid',
    remainingAmount:  'remaining_amount',
    waitTimeFee:      'wait_time_fee',
    waitTimeStart:    'wait_time_start',
    noShow:           'no_show',
    noShowFee:        'no_show_fee',
    feeWaived:        'fee_waived',
    feeWaivedReason:  'fee_waived_reason',
    refundedAt:       'refunded_at',
    refundedBy:       'refunded_by',
    commissionCredited: 'commission_credited',
    passengerSettled:   'passenger_settled',
    driverCancellationCredited: 'driver_cancellation_credited',
    passengerRating:  'passenger_rating',
    passengerComment: 'passenger_comment',
    ratedAt:          'rated_at',
    acceptedAt:       'accepted_at',
    arrivedAt:        'arrived_at',
    startedAt:        'started_at',
    cancelledAt:      'cancelled_at',
    completedAt:      'completed_at',
    odometerKm:       'odometer_km',
    actualDistanceKm: 'actual_distance_km',
    pickupNote:       'pickup_note',
  };
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) result[map[key] || key] = value;
  }
  return result;
}

export function toWalletEntry(row) {
  return {
    id:          row.id,
    amount:      row.amount,
    type:        row.type,
    description: row.description,
    rideId:      row.ride_id,
    createdAt:   ts(row.created_at),
  };
}

export function toBid(row) {
  return {
    id:        row.id,
    rideId:    row.ride_id,
    driverId:  row.driver_id,
    status:    row.status,
    createdAt: ts(row.created_at),
  };
}
