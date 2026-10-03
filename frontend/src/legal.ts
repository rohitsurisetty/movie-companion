import { Alert, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { API_BASE } from './store';

/**
 * Version of the Terms / Community Guidelines / Privacy Policy the user
 * accepts on the login screen. Bump it when the documents change materially:
 * everyone then has to tick the consent box again before signing in.
 */
export const TERMS_VERSION = '2026-10-03';

/** AsyncStorage key holding the TERMS_VERSION this device last accepted. */
export const TERMS_ACCEPTED_KEY = 'accepted_terms_version';

/** Public legal pages served by the backend (plain HTML, no auth needed). */
export const LEGAL_URLS = {
  terms: `${API_BASE}/legal/terms`,
  privacy: `${API_BASE}/legal/privacy`,
  guidelines: `${API_BASE}/legal/guidelines`,
  deleteAccount: `${API_BASE}/legal/delete-account`,
  contact: `${API_BASE}/legal/contact`,
};

/**
 * Opens a legal / support page in the in-app browser (Chrome Custom Tab),
 * falling back to the system browser. Never throws, so it can be called
 * straight from an onPress.
 */
export async function openLegal(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { toolbarColor: '#0A0A0A', showTitle: true });
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Couldn't open page", 'Please check your connection and try again.');
    }
  }
}
