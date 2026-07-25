import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { toRide } from '../../lib/transforms';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/SettingsContext';
import RatingStars from '../../components/RatingStars';

export default function PassengerTripHistoryScreen() {
  const { user, userProfile } = useAuth();
  const { colors, shadow, t } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingRide, setRatingRide] = useState(null);
  const [ratingVal, setRatingVal] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchRides = async () => {
      const { data } = await supabase
        .from('rides')
        .select('*')
        .eq('passenger_id', user.uid)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      if (data) setRides(data.map(toRide));
      setLoading(false);
    };
    fetchRides();

    const channel = supabase
      .channel('passenger_history_' + user.uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rides',
        filter: `passenger_id=eq.${user.uid}`,
      }, fetchRides)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleRateSubmit = async () => {
    if (!ratingRide || ratingSubmitting) return;
    setRatingSubmitting(true);
    try {
      await supabase.from('rides').update({
        passenger_rating:  ratingVal,
        passenger_comment: ratingComment.trim(),
      }).eq('id', ratingRide.id);

      if (ratingVal > 0 && ratingRide.driverId) {
        supabase.from('reviews').insert({
          ride_id:        ratingRide.id,
          driver_id:      ratingRide.driverId,
          passenger_id:   user.uid,
          passenger_name: userProfile?.name,
          rating:         ratingVal,
          comment:        ratingComment.trim() || null,
        }).then(() => {});
      }
      setRatingRide(null);
      setRatingVal(0);
      setRatingComment('');
    } catch (_) {} finally {
      setRatingSubmitting(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-EG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={!!ratingRide} transparent animationType="slide">
        <View style={styles.ratingOverlay}>
          <View style={styles.ratingSheet}>
            <Text style={styles.ratingTitle}>{t('rateDriver')}</Text>
            <Text style={styles.ratingDriverName}>{ratingRide?.driverName}</Text>
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <RatingStars rating={ratingVal} onRate={setRatingVal} size={44} />
            </View>
            <TextInput
              style={styles.commentInput}
              placeholder={t('leaveComment')}
              placeholderTextColor={colors.gray}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              maxLength={200}
            />
            <TouchableOpacity
              style={[styles.ratingSubmitBtn, ratingSubmitting && { opacity: 0.6 }]}
              onPress={handleRateSubmit}
              disabled={ratingSubmitting}
            >
              {ratingSubmitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ratingSubmitText}>
                    {ratingVal === 0 ? t('skipFinish') : t('submitRating')}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={{ alignItems: 'center', marginTop: 10 }}
              onPress={() => setRatingRide(null)}
            >
              <Text style={{ color: colors.gray, fontSize: 14 }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('tripHistory')}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : rides.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={styles.emptyText}>{t('noTripsYet')}</Text>
          </View>
        ) : (
          rides.map((ride) => (
            <View key={ride.id} style={styles.rideCard}>
              <View style={styles.rideHeader}>
                <Text style={styles.rideDate}>{formatDate(ride.createdAt)}</Text>
                <Text style={styles.rideFare}>{ride.estimatedFare} EGP</Text>
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
                    <Text style={styles.metaItem}>{'★'.repeat(ride.passengerRating)}</Text>
                  </>
                )}
              </View>
              {!ride.passengerRating && (
                <TouchableOpacity
                  style={styles.rateNowBtn}
                  onPress={() => { setRatingRide(ride); setRatingVal(0); setRatingComment(''); }}
                >
                  <Text style={styles.rateNowText}>{t('rateNow')} ★</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.primaryBg },
    scroll: { padding: 20, paddingBottom: 48 },
    title: { fontSize: 22, fontWeight: '800', color: colors.dark, marginBottom: 16 },
    rideCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, ...shadow.sm },
    rideHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    rideDate: { fontSize: 12, color: colors.gray },
    rideFare: { fontSize: 16, fontWeight: '800', color: colors.primary },
    rideRoute: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    routeText: { fontSize: 13, color: colors.dark, flex: 1 },
    rideMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4, flexWrap: 'wrap' },
    metaItem: { fontSize: 12, color: colors.gray },
    metaDot: { fontSize: 12, color: colors.border },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyText: { fontSize: 15, color: colors.gray, textAlign: 'center' },
    rateNowBtn: {
      marginTop: 8, alignSelf: 'flex-start',
      backgroundColor: colors.primaryBg, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: 1, borderColor: colors.primary + '60',
    },
    rateNowText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
    ratingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    ratingSheet: {
      backgroundColor: colors.white, borderTopLeftRadius: 24,
      borderTopRightRadius: 24, padding: 24, paddingBottom: 36,
    },
    ratingTitle: { fontSize: 18, fontWeight: '700', color: colors.dark, textAlign: 'center' },
    ratingDriverName: { fontSize: 14, color: colors.gray, textAlign: 'center', marginTop: 4 },
    commentInput: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      padding: 12, fontSize: 14, color: colors.dark,
      minHeight: 72, textAlignVertical: 'top', marginBottom: 14,
    },
    ratingSubmitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
    ratingSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
