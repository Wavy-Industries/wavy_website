import type { OperatingSystem } from '~/lib/utils/operating_system';

export type BrowserId = 'chrome' | 'edge' | 'bluefy';

export type BrowserRec = {
  id: BrowserId;
  name: string;
  url?: string;
};

export type BrowserSupport = {
  message: string;
  recs: BrowserRec[];
};

export function getBrowserRecommendations(os: OperatingSystem): BrowserSupport {
  switch (os) {
    case 'Windows':
      return {
        message: 'Use Chrome or Edge on Windows.',
        recs: [
          { id: 'chrome', name: 'Google Chrome', url: 'https://www.google.com/chrome/' },
          { id: 'edge', name: 'Microsoft Edge', url: 'https://www.microsoft.com/edge' },
        ],
      };
    case 'MacOS':
      return {
        message: 'Use a Chrome browser on macOS.',
        recs: [{ id: 'chrome', name: 'Google Chrome', url: 'https://www.google.com/chrome/' }],
      };
    case 'Linux':
      return {
        message: 'Use a Chrome browser on Linux.',
        recs: [{ id: 'chrome', name: 'Google Chrome', url: 'https://www.google.com/chrome/' }],
      };
    case 'Android':
      return {
        message: 'Use a Chrome browser on Android.',
        recs: [{ id: 'chrome', name: 'Google Chrome', url: 'https://play.google.com/store/apps/details?id=com.android.chrome' }],
      };
    case 'iOS':
      return {
        message: 'Please use Bluefy on iOS.',
        recs: [{ id: 'bluefy', name: 'Bluefy', url: 'https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055' }],
      };
    default:
      return { message: 'Browser support may be limited on your operating system.', recs: [] };
  }
}
