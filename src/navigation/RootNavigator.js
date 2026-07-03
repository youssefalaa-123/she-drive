import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import AuthStack from './AuthStack';
import PassengerNavigator from './PassengerNavigator';
import DriverNavigator from './DriverNavigator';
import PendingApproval from '../screens/auth/PendingApproval';

const PendingStack = createStackNavigator();

function PendingStackNavigator() {
  return (
    <PendingStack.Navigator screenOptions={{ headerShown: false }}>
      <PendingStack.Screen name="PendingApproval" component={PendingApproval} />
    </PendingStack.Navigator>
  );
}

function Navigator() {
  const { user, userProfile, loading } = useAuth();

  // Show spinner while Firebase auth/profile is loading,
  // OR while user is authenticated but profile hasn't arrived yet (post-registration race).
  if (loading || (user && !userProfile)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryBg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user || !userProfile) return <AuthStack />;
  if (userProfile.role === 'driver' && !userProfile.approved) return <PendingStackNavigator />;
  if (userProfile.role === 'driver') return <DriverNavigator />;
  return <PassengerNavigator />;
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Navigator />
    </NavigationContainer>
  );
}
