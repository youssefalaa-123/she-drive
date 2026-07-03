import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/SettingsContext';
import HomeScreen from '../screens/passenger/HomeScreen';
import HistoryWalletScreen from '../screens/passenger/HistoryWalletScreen';
import ProfileScreen from '../screens/passenger/ProfileScreen';
import ActiveRideScreen from '../screens/passenger/ActiveRideScreen';
import TripSummaryScreen from '../screens/passenger/TripSummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const ICONS = {
  Book:     ['home', 'home-outline'],
  History:  ['time', 'time-outline'],
  Profile:  ['person-circle', 'person-circle-outline'],
  Settings: ['settings', 'settings-outline'],
};

function PassengerTabs() {
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
      <Tab.Screen name="Book" component={HomeScreen} options={{ tabBarLabel: t('book') }} />
      <Tab.Screen name="History" component={HistoryWalletScreen} options={{ tabBarLabel: t('history') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: t('profile') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: t('settings') }} />
    </Tab.Navigator>
  );
}

export default function PassengerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PassengerTabs" component={PassengerTabs} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} />
      <Stack.Screen name="TripSummary" component={TripSummaryScreen} />
    </Stack.Navigator>
  );
}
