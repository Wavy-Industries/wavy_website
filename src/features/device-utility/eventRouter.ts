/*
connects modules together which relies on callbacks for event communication
*/

import { bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished, deviceStateService, smpService, midiService } from '~/lib/states/bluetooth.svelte';
import { refreshChangelog, refreshDeviceFirmwareVersion } from '~/lib/states/firmware.svelte';
import { midiTesterOnNoteOn, midiTesterOnNoteOff, midiTesterOnCC } from '~/features/device-utility/states/midiTester.svelte';
import { soundBackend } from '~/lib/soundBackend';
import { setLocalSamplesMode } from './states/samplesLocal.svelte';
import { SampleMode } from '~/lib/types/sampleMode';
import { initialiseDeviceSamples, invalidateDeviceSamplesState } from '~/lib/states/samples.svelte';
import { updaterNotifyConnectionReestablished, updaterNotifyIsSupported } from '~/lib/states/updater.svelte';
import { initPlaygroundSynthPersistence, midiControlOnCC, midiControlOnNoteOff, midiControlOnNoteOn } from './states/playground.svelte';
import { windowState, DeviceUtilityView } from './states/window.svelte';
import { deviceState, setDeviceStateFromSnapshot } from './states/deviceState.svelte';
import { setTempo } from './states/tempo.svelte';
import { initializeBatteryState, resetBatteryState } from './states/bas.svelte';
import { refreshDisState, resetDisState } from './states/dis.svelte';

export const callbacksSet = () => {
    const _initializeBluetoothModules = async () => {
        try {
            const available = await deviceStateService.initialize();
            deviceState.isAvailable = available;
            await initializeBatteryState();
            await midiService.initialize();
            await refreshDisState();
        } catch {}
    };

    deviceStateService.onStateUpdate = (state) => {
        setDeviceStateFromSnapshot(state);
        if (state.bpm !== null) setTempo(state.bpm);
    };

    bluetoothManager.onConnect = () => {
        midiService.reset();
        deviceStateService.reset();
        smpService.reset();
        resetDisState();
        deviceState.isAvailable = null;
        resetBatteryState();

        initPlaygroundSynthPersistence();
        void refreshChangelog();
        setLocalSamplesMode(SampleMode.DRM);
        bluetoothStateSetConnected();
        (async () => {
            await _initializeBluetoothModules();
            await refreshDeviceFirmwareVersion();
            await initialiseDeviceSamples();
            updaterNotifyIsSupported();
        })()
    }

    bluetoothManager.onConnectionReestablished = () => {
        midiService.reset();
        deviceStateService.reset();
        smpService.reset();
        resetDisState();
        deviceState.isAvailable = null;
        resetBatteryState();

        initPlaygroundSynthPersistence();
        void refreshChangelog();
        updaterNotifyConnectionReestablished();
        
        bluetoothStateSetConnectionReestablished();
        (async () => {
            await _initializeBluetoothModules();
            await refreshDeviceFirmwareVersion();
            await initialiseDeviceSamples();
            updaterNotifyIsSupported();
        })()
    }

    bluetoothManager.onConnecting = () => {
        bluetoothStateSetConnecting();
    }

    bluetoothManager.onDisconnect = () => {
        invalidateDeviceSamplesState();
        resetDisState();
        deviceState.isAvailable = null;
        resetBatteryState();
        bluetoothStateSetDisconnected();
    }

    bluetoothManager.onConnectionLoss = () => {    
        invalidateDeviceSamplesState();
        resetDisState();
        deviceState.isAvailable = null;
        resetBatteryState();
        bluetoothStateSetConnectionLoss();
    }

    /* MIDI event router */
    midiService.onNoteOn = (note: number, velocity: number, channel: number) => {
        try { soundBackend.resume?.(); } catch {}
        const vel = 100; // MONKEY default: fixed velocity
        soundBackend.noteOn(note, vel, channel);

        midiControlOnNoteOn(note, vel, channel);

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnNoteOn(note, velocity, channel);
    }

    midiService.onNoteOff = (note: number, velocity: number, channel: number) => {
        soundBackend.noteOff(note, velocity, channel);

        midiControlOnNoteOff(note, velocity, channel);
        
        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnNoteOff(note, velocity, channel);
    }

    midiService.onControlChange = (_controller: number, _value: number, _channel: number) => {
        soundBackend.setCC(_controller, _value, _channel);
        
        midiControlOnCC(_controller, _value, _channel);
        
        // Track BPM from CC if device sends it
        // (Note: may not be sent by device, BPM detection would need sequence timing analysis)

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnCC(_controller, _value, _channel);
    }
}
