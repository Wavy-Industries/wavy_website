/**
 * Device configuration
 *
 * Derives device identifier from the connected Bluetooth device name.
 * For "WAVY MONKEY" → "MONKEY", "WAVY KEYS" → "KEYS", etc.
 */

import { bluetoothState } from '~/lib/states/bluetooth.svelte';

/**
 * Extract device identifier from full Bluetooth device name.
 * e.g., "WAVY MONKEY" → "MONKEY"
 */
function extractDeviceId(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    // Return last part, or fallback if empty
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || 'MONKEY');
}

/**
 * Get the current device identifier.
 * Derives from connected Bluetooth device name, falls back to 'MONKEY'.
 */
export function getDeviceName(): string {
    const fullName = bluetoothState.deviceName;
    if (!fullName || fullName === 'unknown device name') {
        return 'MONKEY'; // Default fallback
    }
    return extractDeviceId(fullName);
}
