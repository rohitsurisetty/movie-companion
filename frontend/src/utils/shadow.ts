/**
 * Cross-platform shadow helper.
 *
 * React Native 0.76+ (and react-native-web 0.21+) deprecated the legacy
 * `shadowColor / shadowOffset / shadowOpacity / shadowRadius` style props
 * in favour of the standard CSS `boxShadow` string. Android still uses
 * `elevation` for its native drop shadow, so we return both when needed.
 *
 * Usage:
 *   ...shadow({ color: '#000', offsetY: 4, blur: 8, opacity: 0.3, elevation: 6 })
 */
import { ViewStyle } from 'react-native';

export interface ShadowConfig {
  color?: string;       // hex (#RRGGBB / #RGB) or rgb()/rgba() string
  offsetX?: number;     // px
  offsetY?: number;     // px
  blur?: number;        // px (formerly shadowRadius)
  opacity?: number;     // 0..1
  elevation?: number;   // Android only
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const hexToRgba = (hex: string, opacity: number): string => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length === 8) {
    // #RRGGBBAA → drop alpha, we control it via opacity
    h = h.substring(0, 6);
  }
  if (h.length !== 6) return `rgba(0, 0, 0, ${clamp01(opacity)})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(opacity)})`;
};

const toRgbaString = (color: string, opacity: number): string => {
  if (!color) return `rgba(0, 0, 0, ${clamp01(opacity)})`;
  if (color.startsWith('#')) return hexToRgba(color, opacity);
  // already an rgb()/rgba() — return as-is (opacity already baked or
  // user is responsible). We do not try to splice opacity into rgba().
  return color;
};

export const shadow = (config: ShadowConfig = {}): ViewStyle => {
  const {
    color = '#000',
    offsetX = 0,
    offsetY = 2,
    blur = 4,
    opacity = 0.25,
    elevation,
  } = config;
  const rgba = toRgbaString(color, opacity);
  const style: any = {
    boxShadow: `${offsetX}px ${offsetY}px ${blur}px ${rgba}`,
  };
  if (typeof elevation === 'number') {
    style.elevation = elevation;
  }
  return style as ViewStyle;
};

export default shadow;
