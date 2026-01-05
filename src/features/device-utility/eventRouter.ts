/*
connects modules together which relies on callbacks for event communication
*/

import { batteryService, batteryState, bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished, deviceStateService, smpService, midiService } from '~/lib/states/bluetooth.svelte';
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

export const callbacksSet = () => {
    deviceStateService.onStateUpdate = (state) => {
        setDeviceStateFromSnapshot(state);
        if (state.bpm !== null) setTempo(state.bpm);
    };

    bluetoothManager.onConnect = () => {
        midiService.reset();
        deviceStateService.reset();
        smpService.reset();
        deviceState.isAvailable = null;
        batteryState.level = null;
        batteryService.onBatteryLevel = (level) => { batteryState.level = level; };
        batteryService.reset();

        initPlaygroundSynthPersistence();
        refreshDeviceFirmwareVersion();
        refreshChangelog();
        setLocalSamplesMode(SampleMode.DRM);
        (async () => {
            await initialiseDeviceSamples();
            updaterNotifyIsSupported();
        })()
        void batteryService.getBatteryLevel();
        (async () => {
            const available = await deviceStateService.initialize();
            deviceState.isAvailable = available;
        })()

        bluetoothStateSetConnected();
    }

    bluetoothManager.onConnectionReestablished = () => {
        midiService.reset();
        deviceStateService.reset();
        smpService.reset();
        deviceState.isAvailable = null;
        batteryState.level = null;
        batteryService.onBatteryLevel = (level) => { batteryState.level = level; };
        batteryService.reset();

        initPlaygroundSynthPersistence();
        refreshDeviceFirmwareVersion();

        (async () => {
            await initialiseDeviceSamples();
            updaterNotifyIsSupported();
        })()
        void batteryService.getBatteryLevel();
        (async () => {
            const available = await deviceStateService.initialize();
            deviceState.isAvailable = available;
        })()
        updaterNotifyConnectionReestablished();
        
        bluetoothStateSetConnectionReestablished();
    }

    bluetoothManager.onConnecting = () => {
        bluetoothStateSetConnecting();
    }

    bluetoothManager.onDisconnect = () => {
        invalidateDeviceSamplesState();
        deviceState.isAvailable = null;
        batteryState.level = null;
        batteryService.onBatteryLevel = null;
        bluetoothStateSetDisconnected();
    }

    bluetoothManager.onConnectionLoss = () => {    
        invalidateDeviceSamplesState();
        deviceState.isAvailable = null;
        batteryState.level = null;
        batteryService.onBatteryLevel = null;
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
