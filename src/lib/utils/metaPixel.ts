/**
 * Meta Pixel utility for programmatic event tracking
 * 
 * Usage:
 * ```ts
 * import { trackEvent } from '~/lib/utils/metaPixel';
 * 
 * trackEvent('ViewContent', { content_name: 'MONKEY Product Page' });
 * trackEvent('AddToCart', { value: 99.99, currency: 'USD' });
 * ```
 */

declare global {
  interface Window {
    fbq?: (
      command: 'init' | 'track' | 'trackCustom',
      eventName: string,
      params?: Record<string, any>
    ) => void;
  }
}

/**
 * Track a Meta Pixel event
 * @param eventName - Standard Meta Pixel event name (e.g., 'PageView', 'ViewContent', 'AddToCart', 'Purchase')
 * @param params - Optional event parameters
 */
export function trackEvent(eventName: string, params?: Record<string, any>): void {
  if (typeof window === 'undefined' || !window.fbq) {
    console.warn('Meta Pixel not initialized');
    return;
  }

  window.fbq('track', eventName, params);
}

/**
 * Track a custom Meta Pixel event
 * @param eventName - Custom event name (must start with 'Custom' or use a custom name)
 * @param params - Optional event parameters
 */
export function trackCustomEvent(eventName: string, params?: Record<string, any>): void {
  if (typeof window === 'undefined' || !window.fbq) {
    console.warn('Meta Pixel not initialized');
    return;
  }

  window.fbq('trackCustom', eventName, params);
}

/**
 * Check if Meta Pixel is loaded
 */
export function isMetaPixelLoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

