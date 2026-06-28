import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
};

type State = {
  hasError: boolean;
  error?: Error;
};

/**
 * Generic error boundary so a single bad render doesn't crash the whole APK.
 * Shows a friendly retry screen and logs the error.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children as React.ReactElement;

    return (
      <View style={styles.container}>
        <Ionicons name="sad-outline" size={48} color="#FF6B6B" />
        <Text style={styles.title}>{this.props.fallbackTitle || 'Something went wrong'}</Text>
        <Text style={styles.message}>
          {this.props.fallbackMessage || "Sorry about that. Tap below to try again."}
        </Text>
        {!!this.state.error?.message && (
          <Text style={styles.errMsg} numberOfLines={3}>
            {this.state.error.message}
          </Text>
        )}
        <TouchableOpacity style={styles.btn} onPress={this.handleRetry} activeOpacity={0.8}>
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  errMsg: {
    color: 'rgba(255,107,107,0.85)',
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  btn: {
    marginTop: 24,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
