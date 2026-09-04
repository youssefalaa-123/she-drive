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

// Three ascending tones (C5→E5→G5): distinctive, short, pleasant
function playRideSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99];
    let start = ctx.currentTime;
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.7, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.start(start);
      osc.stop(start + 0.28);
      start += 0.22;
    });
    // Close context after the last tone finishes
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch (e) {
    console.warn('[sound] playRideSound failed:', e.message);
  }
}

// Registers this device for push notifications and saves the subscription to Supabase.
// Only runs for approved drivers with an approved car license on web browsers.
export function usePushNotifications(userProfile) {
  // Sound listener — active for any approved driver with approved car license
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!userProfile?.uid) return;
    if (userProfile.role !== 'driver') return;
    if (!userProfile.approved || !userProfile.carLicenseApproved) return;
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (e) => {
      if (e.data?.type === 'RIDE_REQUEST_SOUND') playRideSound();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [userProfile?.uid, userProfile?.approved, userProfile?.carLicenseApproved]);

  // Push subscription registration
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
