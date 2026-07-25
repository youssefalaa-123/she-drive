import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/SettingsContext';
import HomeScreen from '../screens/passenger/HomeScreen';
import PassengerWalletScreen from '../screens/passenger/WalletScreen';
import PassengerTripHistoryScreen from '../screens/passenger/TripHistoryScreen';
import ProfileScreen from '../screens/passenger/ProfileScreen';
import ActiveRideScreen from '../screens/passenger/ActiveRideScreen';
import TripSummaryScreen from '../screens/passenger/TripSummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();
const ProfileStack = createStackNavigator();

const TAB_ICONS = {
  Book:        ['home', 'home-outline'],
  Wallet:      ['wallet', 'wallet-outline'],
  TripHistory: ['time', 'time-outline'],
  Profile:     ['person-circle', 'person-circle-outline'],
};

// Nested stack for the Profile tab: ProfileMain → Settings (with back button)
function PassengerProfileStack() {
  const { colors, t } = useTheme();
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="PassengerProfileMain"
        component={ProfileScreen}
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
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Book"        component={HomeScreen}              options={{ tabBarLabel: t('book') }} />
      <Tab.Screen name="Wallet"      component={PassengerWalletScreen}  options={{ tabBarLabel: t('wallet') }} />
      <Tab.Screen name="TripHistory" component={PassengerTripHistoryScreen} options={{ tabBarLabel: t('history') }} />
      <Tab.Screen name="Profile"     component={PassengerProfileStack}  options={{ tabBarLabel: t('profile') }} />
    </Tab.Navigator>
  );
}

export default function PassengerNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="PassengerTabs" component={PassengerTabs} />
      <RootStack.Screen name="ActiveRide"    component={ActiveRideScreen} />
      <RootStack.Screen name="TripSummary"   component={TripSummaryScreen} />
    </RootStack.Navigator>
  );
}
