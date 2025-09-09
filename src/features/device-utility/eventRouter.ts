/*
connects modules together which relies on callbacks for event communication
*/

import { bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished, smpService, midiService } from '~/lib/states/bluetooth.svelte';
import { refreshChangelog, refreshDeviceFirmwareVersion } from '~/lib/states/firmware.svelte';
import { midiTesterOnNoteOn, midiTesterOnNoteOff, midiTesterOnCC } from '~/features/device-utility/states/midiTester.svelte';
import { soundBackend } from '~/lib/soundBackend';
import { refreshLocalSamples } from './states/samplesLocal.svelte';
import { initialiseDeviceSamples, invalidateDeviceSamplesState } from '~/lib/states/samples.svelte';
import { updaterNotifyConnectionReestablished, updaterNotifyIsSupported } from '~/lib/states/updater.svelte';
import { midiControlOnCC, midiControlOnNoteOff, midiControlOnNoteOn } from './states/playground.svelte';
import { windowState, DeviceUtilityView } from './states/window.svelte';

export const callbacksSet = () => {

    bluetoothManager.onConnect = () => {
        midiService.reset();
        smpService.reset();
        
        refreshDeviceFirmwareVersion();
        refreshChangelog();
        refreshLocalSamples();
        (async () => {
            await initialiseDeviceSamples();
            updaterNotifyIsSupported();
        })()

        bluetoothStateSetConnected();
    }

    bluetoothManager.onConnectionReestablished = () => {
        midiService.reset();
        smpService.reset();
        
        refreshDeviceFirmwareVersion();

        (async () => {
            await initialiseDeviceSamples();
            updaterNotifyIsSupported();
        })()
        updaterNotifyConnectionReestablished();
        
        bluetoothStateSetConnectionReestablished();
    }

    bluetoothManager.onConnecting = () => {
        bluetoothStateSetConnecting();
    }

    bluetoothManager.onDisconnect = () => {
        invalidateDeviceSamplesState();
        bluetoothStateSetDisconnected();
    }

    bluetoothManager.onConnectionLoss = () => {    
        invalidateDeviceSamplesState();
        bluetoothStateSetConnectionLoss();
    }

    /* MIDI event router */
    midiService.onNoteOn = (note: number, velocity: number, channel: number) => {
        try { soundBackend.resume?.(); } catch {}
        soundBackend.noteOn(note, velocity, channel);

        midiControlOnNoteOn(note, velocity, channel);

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
        midiControlOnCC(_controller, _value, _channel);

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnCC(_controller, _value, _channel);
    }
}
