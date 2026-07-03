import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/SettingsContext';
import DriverHomeScreen from '../screens/driver/HomeScreen';
import DriverEarningsScreen from '../screens/driver/EarningsScreen';
import DriverProfileScreen from '../screens/driver/ProfileScreen';
import ActiveTripScreen from '../screens/driver/ActiveTripScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const ICONS = {
  Drive:    ['car', 'car-outline'],
  Earnings: ['wallet', 'wallet-outline'],
  Profile:  ['person-circle', 'person-circle-outline'],
  Settings: ['settings', 'settings-outline'],
};

function DriverTabs() {
  const { colors, t } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Drive" component={DriverHomeScreen} options={{ tabBarLabel: t('drive') }} />
      <Tab.Screen name="Earnings" component={DriverEarningsScreen} options={{ tabBarLabel: t('earnings') }} />
      <Tab.Screen name="Profile" component={DriverProfileScreen} options={{ tabBarLabel: t('profile') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: t('settings') }} />
    </Tab.Navigator>
  );
}

export default function DriverNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverTabs" component={DriverTabs} />
      <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} />
    </Stack.Navigator>
  );
}
