import { Alert } from 'react-native';
import { apiUrl } from '../store';

/** Where the reported Tina reply was shown. */
export type TinaReportSource = 'chat' | 'call' | 'global';
type TinaReportReason = 'offensive' | 'harmful' | 'inaccurate' | 'other';

// POST /api/tina/report accepts at most 4000 characters of reply text.
const MAX_MESSAGE_CHARS = 4000;

// Truncate by code point (never split an emoji's surrogate pair).
const truncate = (text: string, max: number) => {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
};

const submitTinaReport = async (
  message: string,
  reason: TinaReportReason,
  source: TinaReportSource,
) => {
  let status: number | undefined;
  try {
    const res = await fetch(apiUrl('/api/tina/report'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: truncate(message, MAX_MESSAGE_CHARS), reason, source }),
    });
    if (res.ok) {
      Alert.alert('Thanks', "We'll review this reply.");
      return;
    }
    status = res.status;
  } catch {
    status = undefined;
  }
  if (status === 401) return; // session expired: the fetch wrapper already routes to login
  Alert.alert(
    "Couldn't send report",
    status === 429
      ? 'Too many requests. Please try again shortly.'
      : 'Something went wrong. Check your connection and try again.',
  );
};

/**
 * Google Play AI-generated-content policy: lets the user flag one of Tina's
 * replies (long-press / flag button on a Tina message, or the call screen).
 *
 * Android shows at most three Alert buttons, so the trailing "Cancel" isn't
 * rendered there — `cancelable` lets Back / tapping outside dismiss instead.
 */
export const reportTinaReply = (message: string, source: TinaReportSource) => {
  const send = (reason: TinaReportReason) => () => {
    void submitTinaReport(message, reason, source);
  };
  Alert.alert(
    'Report this reply?',
    "Tell us what's wrong with Tina's reply.",
    [
      { text: 'Offensive', onPress: send('offensive') },
      { text: 'Harmful or unsafe', onPress: send('harmful') },
      { text: 'Inaccurate', onPress: send('inaccurate') },
      { text: 'Cancel', style: 'cancel' },
    ],
    { cancelable: true },
  );
};
