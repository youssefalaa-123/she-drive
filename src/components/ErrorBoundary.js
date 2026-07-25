import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log so we can see which mobile-specific API is failing in the console.
    console.error('[ErrorBoundary] caught crash:', error);
    console.error('[ErrorBoundary] component stack:', info?.componentStack);
    this.setState({ errorInfo: info });
  }

  handleRetry = () => {
    this.setState({ error: null, errorInfo: null });
    // Hard reload on web so we start with a clean JS heap — soft retry often
    // just re-throws the same initialization crash.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Failed to load app</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          <Text style={styles.hint}>
            This can happen when the network is slow or a mobile browser API is unavailable.
            Check your connection and tap the button below to reload.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.handleRetry}>
            <Text style={styles.btnText}>Tap to Reload</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#FFF0F5' },
  emoji:     { fontSize: 56, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: '800', color: '#212121', marginBottom: 12, textAlign: 'center' },
  message:   { fontSize: 13, color: '#C2185B', backgroundColor: '#FFE4EF', borderRadius: 8, padding: 12, marginBottom: 16, fontFamily: 'monospace', width: '100%' },
  hint:      { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn:       { backgroundColor: '#C2185B', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
});
