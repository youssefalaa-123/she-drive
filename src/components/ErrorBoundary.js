import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.hint}>
            If the error mentions Firebase or "invalid API key", open{'\n'}
            src/firebase/config.js and fill in your Firebase credentials.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null })}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#FFF0F5' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#212121', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 13, color: '#C2185B', backgroundColor: '#FFE4EF', borderRadius: 8, padding: 12, marginBottom: 16, fontFamily: 'monospace', width: '100%' },
  hint: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: { backgroundColor: '#C2185B', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
