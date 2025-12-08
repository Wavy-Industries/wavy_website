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
import { setDeviceOctave, setDeviceBPM } from './states/deviceState.svelte';

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
        
        // Track device octave and BPM from specific CCs
        // CC 102: Octave (MONKEY uses CC102 for octave, value 0-6 maps to -3 to +3)
        if (_controller === 102) {
            const octave = Math.max(-3, Math.min(3, _value - 3));
            setDeviceOctave(octave);
        }
        // CC 103: BPM (MONKEY uses CC103, value 0-127 scaled to BPM range)
        // Typical BPM range: 40-240, scaled from 0-127
        if (_controller === 103) {
            const bpm = Math.round(40 + (_value / 127) * 200);
            setDeviceBPM(bpm);
        }

        if (windowState.hash === DeviceUtilityView.DeviceTester)
            midiTesterOnCC(_controller, _value, _channel);
    }
}
