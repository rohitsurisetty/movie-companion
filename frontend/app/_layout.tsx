import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { TinaProvider } from '../src/context/TinaContext';
import FloatingTinaButton from '../src/components/FloatingTinaButton';
import TinaModal from '../src/components/TinaModal';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* KeyboardProvider is REQUIRED at the root for
          react-native-keyboard-controller hooks/components to work. It hooks
          into the native WindowInsets API so chat & form screens behave
          identically in Expo Go and in production APK builds (the previous
          KeyboardAvoidingView-from-react-native approach broke on APK when
          edgeToEdgeEnabled is true — the OS no longer resizes the activity
          on keyboard show, so the JS-only avoiding view couldn't react). */}
      <KeyboardProvider>
        <TinaProvider>
          <GestureHandlerRootView style={styles.container}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#121212' },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="success" />
              <Stack.Screen name="filters" />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
            
            {/* Global Tina - Floating Button & Modal */}
            <FloatingTinaButton />
            <TinaModal />
          </GestureHandlerRootView>
        </TinaProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
});
