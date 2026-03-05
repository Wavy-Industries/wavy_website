/**
 * Event Router
 *
 * Connects modules together that rely on callbacks for event communication.
 * Handles Bluetooth lifecycle events and MIDI routing.
 */

import { bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished, deviceStateService, smpService, midiService } from '~/lib/states/bluetooth.svelte';
import { refreshChangelog, refreshDeviceFirmwareVersion, resetFirmwareState } from '~/lib/states/firmware.svelte';
import { midiTesterOnNoteOn, midiTesterOnNoteOff, midiTesterOnCC } from '~/features/device-utility/states/midiTester.svelte';
import { soundBackend } from '~/lib/soundBackend';
import { setLocalSamplesMode } from './states/samplesLocal.svelte';
import { SampleMode } from '~/lib/types/sampleMode';
import { initialiseDeviceSamples, invalidateDeviceSamplesState } from '~/lib/states/samples.svelte';
import { updaterNotifyConnectionReestablished, updaterNotifyIsSupported, updaterNotifyConnected } from '~/lib/states/updater.svelte';
import { initPlaygroundSynthPersistence, midiControlOnCC, midiControlOnNoteOff, midiControlOnNoteOn } from './states/playground.svelte';
import { windowState, DeviceUtilityView } from './states/window.svelte';
import { deviceState, setDeviceStateFromSnapshot, resetDeviceState } from './states/deviceState.svelte';

import { initializeBatteryState, resetBatteryState } from './states/bas.svelte';
import { refreshDisState, resetDisState, disState, loadingStatus } from './states/dis.svelte';
import { pianoDebugNoteOn, pianoDebugNoteOff } from './states/pianoDebug.svelte';
import { Log } from '~/lib/utils/Log';
import { deviceSupports } from '~/lib/config/deviceProfiles';

const log = new Log('eventRouter', Log.LEVEL_INFO);

export const callbacksSet = () => {
    deviceStateService.onStateUpdate = (state) => {
        setDeviceStateFromSnapshot(state);
    };

    bluetoothManager.onConnect = () => {
        // Update Svelte state first to stay in sync with internal state
        bluetoothStateSetConnected();
        updaterNotifyConnected(); // Notify updater of connection (for manual reconnect flow)

        initPlaygroundSynthPersistence();
        setLocalSamplesMode(SampleMode.DRM);

        // Initialize Bluetooth modules and device data
        (async () => {
            loadingStatus.message = 'Reading device information…';
            try {
                await refreshDisState();
            } catch (e) {
                log.error('Failed to read device information:', e);
                loadingStatus.error = 'Failed to read device information. Please reconnect.';
                return;
            }

            void refreshChangelog();

            loadingStatus.message = 'Initializing services…';
            try {
                const available = await deviceStateService.initialize();
                deviceState.isAvailable = available;
            } catch (e) {
                log.error('Failed to initialize device state service:', e);
            }

            try {
                await initializeBatteryState();
            } catch (e) {
                log.error('Failed to initialize battery state:', e);
            }

            try {
                await midiService.initialize();
            } catch (e) {
                log.error('Failed to initialize MIDI service:', e);
            }

            loadingStatus.message = 'Loading firmware info…';
            try {
                await refreshDeviceFirmwareVersion();
            } catch (e) {
                log.error('Failed to refresh firmware version:', e);
            }

            if (deviceSupports(disState.modelNumber, DeviceUtilityView.SampleManager)) {
                loadingStatus.message = 'Loading samples…';
                try {
                    await initialiseDeviceSamples();
                } catch (e) {
                    log.error('Failed to initialize device samples:', e);
                }
            }

            updaterNotifyIsSupported();
            loadingStatus.message = '';
        })().catch((e) => {
            log.error('Error during connection initialization:', e);
        });
    };

    bluetoothManager.onConnectionReestablished = () => {
        // Update Svelte state first to stay in sync with internal state
        bluetoothStateSetConnectionReestablished();
        updaterNotifyConnectionReestablished();

        initPlaygroundSynthPersistence();

        // Initialize Bluetooth modules and device data
        (async () => {
            loadingStatus.message = 'Reading device information…';
            try {
                await refreshDisState();
            } catch (e) {
                log.error('Failed to read device information:', e);
                loadingStatus.error = 'Failed to read device information. Please reconnect.';
                return;
            }

            void refreshChangelog();

            loadingStatus.message = 'Initializing services…';
            try {
                const available = await deviceStateService.initialize();
                deviceState.isAvailable = available;
            } catch (e) {
                log.error('Failed to initialize device state service:', e);
            }

            try {
                await initializeBatteryState();
            } catch (e) {
                log.error('Failed to initialize battery state:', e);
            }

            try {
                await midiService.initialize();
            } catch (e) {
                log.error('Failed to initialize MIDI service:', e);
            }

            loadingStatus.message = 'Loading firmware info…';
            try {
                await refreshDeviceFirmwareVersion();
            } catch (e) {
                log.error('Failed to refresh firmware version:', e);
            }

            if (deviceSupports(disState.modelNumber, DeviceUtilityView.SampleManager)) {
                loadingStatus.message = 'Loading samples…';
                try {
                    await initialiseDeviceSamples();
                } catch (e) {
                    log.error('Failed to initialize device samples:', e);
                }
            }

            updaterNotifyIsSupported();
            loadingStatus.message = '';
        })().catch((e) => {
            log.error('Error during connection reestablishment:', e);
        });
    };

    bluetoothManager.onConnecting = () => {
        bluetoothStateSetConnecting();
    };

    bluetoothManager.onDisconnect = () => {
        // Update Svelte state first to stay in sync with internal state
        bluetoothStateSetDisconnected();

        // Reset Bluetooth services
        midiService.reset();
        deviceStateService.reset();
        smpService.reset();

        // Reset UI state
        invalidateDeviceSamplesState();
        resetDisState();
        resetDeviceState();
        resetFirmwareState();
        resetBatteryState();
        soundBackend.allNotesOff();
    };

    bluetoothManager.onConnectionLoss = () => {
        // Update Svelte state first to stay in sync with internal state
        bluetoothStateSetConnectionLoss();

        // Reset Bluetooth services
        midiService.reset();
        deviceStateService.reset();
        smpService.reset();

        // Reset UI state
        invalidateDeviceSamplesState();
        resetDisState();
        resetDeviceState();
        resetFirmwareState();
        resetBatteryState();
        soundBackend.allNotesOff();
    };

    /* MIDI event router */
    midiService.onNoteOn = (note: number, velocity: number, channel: number) => {
        try { soundBackend.resume?.(); } catch {}
        const vel = 100; // MONKEY default: fixed velocity
        soundBackend.noteOn(note, vel, channel);

        midiControlOnNoteOn(note, vel, channel);

        // Track note for piano debug preview
        pianoDebugNoteOn(note);

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnNoteOn(note, velocity, channel);
    };

    midiService.onNoteOff = (note: number, velocity: number, channel: number) => {
        soundBackend.noteOff(note, velocity, channel);

        midiControlOnNoteOff(note, velocity, channel);

        // Track note for piano debug preview
        pianoDebugNoteOff(note);

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnNoteOff(note, velocity, channel);
    };

    midiService.onControlChange = (_controller: number, _value: number, _channel: number) => {
        soundBackend.setCC(_controller, _value, _channel);

        midiControlOnCC(_controller, _value, _channel);

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnCC(_controller, _value, _channel);
    };
};
