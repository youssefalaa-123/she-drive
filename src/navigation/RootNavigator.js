import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';
import AuthStack from './AuthStack';
import PendingApproval from '../screens/auth/PendingApproval';
import SetNewPasswordScreen from '../screens/auth/SetNewPasswordScreen';
import CarLicenseUploadScreen from '../screens/auth/CarLicenseUploadScreen';
import PendingCarLicenseApproval from '../screens/auth/PendingCarLicenseApproval';

const PassengerNavigator   = lazy(() => import('./PassengerNavigator'));
const DriverNavigator      = lazy(() => import('./DriverNavigator'));
const AdminDashboardScreen = lazy(() => import('../screens/admin/AdminDashboardScreen'));

const PendingStack            = createStackNavigator();
const AdminStack              = createStackNavigator();
const CarLicenseStack         = createStackNavigator();
const PendingCarLicenseStack  = createStackNavigator();

function PendingStackNavigator() {
  return (
    <PendingStack.Navigator screenOptions={{ headerShown: false }}>
      <PendingStack.Screen name="PendingApproval" component={PendingApproval} />
    </PendingStack.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    </AdminStack.Navigator>
  );
}

function CarLicenseNavigator() {
  return (
    <CarLicenseStack.Navigator screenOptions={{ headerShown: false }}>
      <CarLicenseStack.Screen name="CarLicenseUpload" component={CarLicenseUploadScreen} />
    </CarLicenseStack.Navigator>
  );
}

function PendingCarLicenseNavigator() {
  return (
    <PendingCarLicenseStack.Navigator screenOptions={{ headerShown: false }}>
      <PendingCarLicenseStack.Screen name="PendingCarLicenseApproval" component={PendingCarLicenseApproval} />
    </PendingCarLicenseStack.Navigator>
  );
}

function Spinner() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryBg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// 'idle'     — not applicable (driver has car license or is not a driver)
// 'checking' — async Supabase query in flight
// 'allow'    — driver has active/recent trip; show DriverNavigator
// 'block'    — no active trip and grace period expired; show upload screen
const GRACE_MS = 15 * 60 * 1000; // 15 minutes

function Navigator() {
  const { user, userProfile, loading, recoveryMode } = useAuth();
  usePushNotifications(userProfile);

  // Driver uploaded car license but admin hasn't approved it yet
  const pendingCarLicenseApproval =
    userProfile?.role === 'driver' &&
    userProfile?.approved &&
    userProfile?.carLicensePhotoURL &&
    !userProfile?.carLicenseApproved;

  // Driver is approved but has no car license photo at all
  const needsLicenseCheck =
    userProfile?.role === 'driver' &&
    userProfile?.approved &&
    !userProfile?.carLicensePhotoURL;

  const [licenseGate, setLicenseGate] = useState('idle');
  const graceTimerRef = useRef(null);

  useEffect(() => {
    clearTimeout(graceTimerRef.current);

    if (!needsLicenseCheck) {
      setLicenseGate('idle');
      return;
    }

    setLicenseGate('checking');

    async function check() {
      try {
        // 1. Active trip?
        const { data: activeRide } = await supabase
          .from('rides')
          .select('id')
          .eq('driver_id', user.uid)
          .in('status', ['accepted', 'in_progress'])
          .limit(1)
          .maybeSingle();

        if (activeRide) {
          setLicenseGate('allow');
          return;
        }

        // 2. Within 15-minute grace period after last trip?
        const lastCompleted = userProfile?.lastTripCompletedAt;
        if (lastCompleted) {
          const remaining = GRACE_MS - (Date.now() - lastCompleted.toMillis());
          if (remaining > 0) {
            setLicenseGate('allow');
            graceTimerRef.current = setTimeout(() => setLicenseGate('block'), remaining);
            return;
          }
        }

        setLicenseGate('block');
      } catch {
        // On query failure, default to blocking for safety
        setLicenseGate('block');
      }
    }

    check();

    return () => clearTimeout(graceTimerRef.current);
  }, [needsLicenseCheck, user?.uid, userProfile?.lastTripCompletedAt?.toMillis()]);

  if (recoveryMode) return <SetNewPasswordScreen />;
  if (loading) return <Spinner />;
  if (!user || !userProfile) return <AuthStack />;
  if (userProfile.role === 'admin')                            return <AdminNavigator />;
  if (userProfile.role === 'driver' && !userProfile.approved) return <PendingStackNavigator />;

  if (userProfile.role === 'driver') {
    // Uploaded but awaiting admin approval
    if (pendingCarLicenseApproval) return <PendingCarLicenseNavigator />;

    // Needs to upload car license (not yet submitted)
    if (needsLicenseCheck) {
      if (licenseGate === 'checking') return <Spinner />;
      if (licenseGate === 'block')    return <CarLicenseNavigator />;
      // licenseGate === 'allow': fall through to DriverNavigator
    }
    return <DriverNavigator />;
  }

  return <PassengerNavigator />;
}

export default function RootNavigator() {
  return (
    <NavigationContainer storageKey={null}>
      <Suspense fallback={<Spinner />}>
        <Navigator />
      </Suspense>
    </NavigationContainer>
  );
}
