import { useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY =
  'BMvhq30PzXhyCbKAGOhhtN6F5x8-C9XmbIci50SpqUhmRn0auoXIJb8byItZmiZ4R8XnrulIgeqBpe1YgQBe9Z8';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Registers this device for push notifications and saves the subscription to Supabase.
// Only runs for approved drivers with an approved car license on web browsers.
export function usePushNotifications(userProfile) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!userProfile?.uid) return;
    if (userProfile.role !== 'driver') return;
    if (!userProfile.approved || !userProfile.carLicenseApproved) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        const permission = await Notification.requestPermission();
        if (permission !== 'granted' || cancelled) return;

        // Re-use existing subscription or create new one
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        if (cancelled) return;
        const subJson = sub.toJSON();
        await supabase
          .from('profiles')
          .update({ push_subscription: subJson })
          .eq('id', userProfile.uid);
      } catch (err) {
        console.warn('[push] registration failed:', err.message);
      }
    }

    register();
    return () => { cancelled = true; };
  }, [userProfile?.uid, userProfile?.approved, userProfile?.carLicenseApproved]);
}
