import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from '../screens/auth/SplashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import PassengerOnboarding from '../screens/auth/PassengerOnboarding';
import DriverOnboarding from '../screens/auth/DriverOnboarding';

const Stack = createStackNavigator();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="PassengerOnboarding" component={PassengerOnboarding} />
      <Stack.Screen name="DriverOnboarding" component={DriverOnboarding} />
    </Stack.Navigator>
  );
}
