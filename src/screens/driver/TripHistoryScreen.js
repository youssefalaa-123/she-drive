import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { toRide } from '../../lib/transforms';
import { useAuth } from '../../context/AuthContext';
import { splitFare } from '../../utils/pricing';
import { useTheme } from '../../context/SettingsContext';

export default function DriverTripHistoryScreen() {
  const { user } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchRides = async () => {
      const { data } = await supabase
        .from('rides')
        .select('*')
        .eq('driver_id', user.uid)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      if (data) setRides(data.map(toRide));
      setLoading(false);
    };
    fetchRides();

    const channel = supabase
      .channel('driver_history_' + user.uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rides',
        filter: `driver_id=eq.${user.uid}`,
      }, fetchRides)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('history')}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : rides.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🚗</Text>
            <Text style={styles.emptyText}>{t('noTripsDriver')}</Text>
          </View>
        ) : (
          rides.map((ride) => {
            const { driverAmount: earned, adminAmount: commission } = splitFare(
              ride.estimatedFare || 0, ride.isFirstRide
            );
            return (
              <View key={ride.id} style={styles.rideCard}>
                <View style={styles.rideHeader}>
                  <Text style={styles.rideDate}>{formatDate(ride.createdAt)}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rideEarning}>{earned} EGP</Text>
                    {!ride.isFirstRide && (
                      <Text style={styles.rideCommission}>-{commission} EGP commission</Text>
                    )}
                  </View>
                </View>
                <View style={styles.rideRoute}>
                  <View style={[styles.dot, { backgroundColor: colors.success }]} />
                  <Text style={styles.routeText} numberOfLines={1}>{ride.from}</Text>
                </View>
                <View style={styles.rideRoute}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.routeText} numberOfLines={1}>{ride.to}</Text>
                </View>
                <View style={styles.rideMeta}>
                  <Text style={styles.metaItem}>{ride.distanceKm} km</Text>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.metaItem}>{ride.paymentMethod}</Text>
                  {ride.passengerRating > 0 && (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={[styles.metaItem, { color: '#F59E0B' }]}>
                        {'★'.repeat(ride.passengerRating)}
                      </Text>
                    </>
                  )}
                </View>
                {ride.passengerComment ? (
                  <View style={styles.reviewBubble}>
                    <Text style={styles.reviewText}>"{ride.passengerComment}"</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: colors.dark, marginBottom: 16 },
    rideCard: {
      backgroundColor: colors.white, borderRadius: 14, padding: 16,
      marginBottom: 10, ...shadow.sm,
    },
    rideHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    rideDate: { fontSize: 12, color: colors.gray },
    rideEarning: { fontSize: 16, fontWeight: '800', color: colors.primary },
    rideCommission: { fontSize: 11, color: colors.error },
    rideRoute: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    routeText: { fontSize: 13, color: colors.dark, flex: 1 },
    rideMeta: { flexDirection: 'row', marginTop: 8, gap: 4, flexWrap: 'wrap' },
    metaItem: { fontSize: 12, color: colors.gray },
    metaDot: { fontSize: 12, color: colors.border },
    reviewBubble: {
      backgroundColor: colors.primaryBg, borderRadius: 8,
      padding: 8, marginTop: 8,
    },
    reviewText: { fontSize: 12, color: colors.dark, fontStyle: 'italic' },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyText: { fontSize: 15, color: colors.gray, textAlign: 'center' },
  });
}
