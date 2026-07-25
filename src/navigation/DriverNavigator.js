import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/SettingsContext';
import DriverHomeScreen from '../screens/driver/HomeScreen';
import DriverEarningsScreen from '../screens/driver/EarningsScreen';
import DriverTripHistoryScreen from '../screens/driver/TripHistoryScreen';
import DriverProfileScreen from '../screens/driver/ProfileScreen';
import ActiveTripScreen from '../screens/driver/ActiveTripScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();
const ProfileStack = createStackNavigator();

const TAB_ICONS = {
  Drive:       ['car', 'car-outline'],
  Earnings:    ['wallet', 'wallet-outline'],
  TripHistory: ['time', 'time-outline'],
  Profile:     ['person-circle', 'person-circle-outline'],
};

// Nested stack for the Profile tab: ProfileMain → Settings (with back button)
function DriverProfileStack() {
  const { colors, t } = useTheme();
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="DriverProfileMain"
        component={DriverProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={({ navigation }) => ({
          headerShown: true,
          headerTitle: '',
          headerBackTitleVisible: false,
          headerStyle: {
            backgroundColor: colors.primaryBg,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginLeft: 12, padding: 4 }}
            >
              <Ionicons name="chevron-back" size={26} color={colors.primary} />
            </TouchableOpacity>
          ),
        })}
      />
    </ProfileStack.Navigator>
  );
}

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
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Drive"       component={DriverHomeScreen}        options={{ tabBarLabel: t('drive') }} />
      <Tab.Screen name="Earnings"    component={DriverEarningsScreen}    options={{ tabBarLabel: t('earnings') }} />
      <Tab.Screen name="TripHistory" component={DriverTripHistoryScreen} options={{ tabBarLabel: t('history') }} />
      <Tab.Screen name="Profile"     component={DriverProfileStack}      options={{ tabBarLabel: t('profile') }} />
    </Tab.Navigator>
  );
}

export default function DriverNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="DriverTabs" component={DriverTabs} />
      <RootStack.Screen name="ActiveTrip" component={ActiveTripScreen} />
    </RootStack.Navigator>
  );
}
