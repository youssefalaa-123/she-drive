import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import AuthStack from './AuthStack';
import PendingApproval from '../screens/auth/PendingApproval';
import SetNewPasswordScreen from '../screens/auth/SetNewPasswordScreen';

// Lazy-load the three heavy navigator bundles — each user type only downloads
// its own code. On native, Metro still bundles them synchronously (lazy is a
// no-op there), so this is a web-only code-splitting win with no native risk.
const PassengerNavigator   = lazy(() => import('./PassengerNavigator'));
const DriverNavigator      = lazy(() => import('./DriverNavigator'));
const AdminDashboardScreen = lazy(() => import('../screens/admin/AdminDashboardScreen'));

const PendingStack = createStackNavigator();
const AdminStack   = createStackNavigator();

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

function Spinner() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryBg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function Navigator() {
  const { user, userProfile, loading, recoveryMode } = useAuth();

  if (recoveryMode) return <SetNewPasswordScreen />;

  // `loading` is the single source of truth — it is now guaranteed to resolve
  // within 5 s (PROFILE_TIMEOUT_MS in AuthContext) even on a dead connection.
  // We no longer gate on `user && !userProfile` here because the timeout fires
  // `setLoading(false)` before `userProfile` may be available, and keeping the
  // second condition would re-trap the user in an infinite spinner.
  if (loading) return <Spinner />;

  if (!user || !userProfile) return <AuthStack />;
  if (userProfile.role === 'admin')                           return <AdminNavigator />;
  if (userProfile.role === 'driver' && !userProfile.approved) return <PendingStackNavigator />;
  if (userProfile.role === 'driver')                          return <DriverNavigator />;
  return <PassengerNavigator />;
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      {/* Suspense catches the brief async resolution of lazy-loaded navigators */}
      <Suspense fallback={<Spinner />}>
        <Navigator />
      </Suspense>
    </NavigationContainer>
  );
}
