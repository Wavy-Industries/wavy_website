/*
connects modules together which relies on callbacks for event communication
*/

import { bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished, smpService, midiService } from '~/lib/states/bluetooth.svelte';
import { refreshChangelog, refreshDeviceFirmwareVersion } from '~/lib/states/firmware.svelte';
import { midiTesterOnNoteOn, midiTesterOnNoteOff, midiTesterOnCC } from '~/features/device-utility/states/midiTester.svelte';
import { soundBackend } from '~/lib/soundBackend';
import { setLocalSamplesMode } from './states/samplesLocal.svelte';
import { SampleMode } from '~/lib/types/sampleMode';
import { initialiseDeviceSamples, invalidateDeviceSamplesState } from '~/lib/states/samples.svelte';
import { updaterNotifyConnectionReestablished, updaterNotifyIsSupported } from '~/lib/states/updater.svelte';
import { midiControlOnCC, midiControlOnNoteOff, midiControlOnNoteOn } from './states/playground.svelte';
import { windowState, DeviceUtilityView } from './states/window.svelte';
import { deviceState, setDeviceOctave, setDeviceBPM } from './states/deviceState.svelte';

export const callbacksSet = () => {

    bluetoothManager.onConnect = () => {
        midiService.reset();
        smpService.reset();
        
        refreshDeviceFirmwareVersion();
        refreshChangelog();
        setLocalSamplesMode(SampleMode.DRM);
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
        
        // Infer octave from note range (assuming middle C = 60)
        // MONKEY default octave plays notes around C4 (60), so we can detect shifts
        if (channel !== 9) { // Skip drums
            const octave = Math.floor((note - 60) / 12);
            if (octave !== deviceState.octave) {
                setDeviceOctave(octave);
            }
        }

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
