/*
connects modules together which relies on callbacks for event communication
*/

import { bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished } from '~/features/device-utility/states/bluetooth.svelte';
import { refreshChangelog, refreshDeviceFirmwareVersion } from './states/firmware.svelte';
import { midiTesterOnNoteOn, midiTesterOnNoteOff, midiTesterOnCC } from '~/features/device-utility/states/midiTester.svelte';
import { smpService, midiService } from './states/bluetooth.svelte';
import { soundBackend } from '~/lib/soundBackend';
import { refreshLocalSamples } from './states/samplesLocal.svelte';
import { initialiseDeviceSamples } from './states/samplesDevice.svelte';

export const callbacksSet = () => {

    bluetoothManager.onConnect = () => {
        midiService.reset();
        smpService.reset();
        
        refreshDeviceFirmwareVersion();
        refreshChangelog();
        initialiseDeviceSamples();
        refreshLocalSamples();

        bluetoothStateSetConnected();
    }

    bluetoothManager.onConnectionReestablished = () => {
        midiService.reset();
        smpService.reset();
        
        refreshDeviceFirmwareVersion();
        initialiseDeviceSamples();
        
        bluetoothStateSetConnectionReestablished();
    }

    bluetoothManager.onConnecting = () => {
        bluetoothStateSetConnecting();
    }

    bluetoothManager.onDisconnect = () => {
        bluetoothStateSetDisconnected();
    }

    bluetoothManager.onConnectionLoss = () => {    
        bluetoothStateSetConnectionLoss();
    }

    /* MIDI event router */
    midiService.onNoteOn = (note: number, velocity: number, channel: number) => {
        try { soundBackend.resume?.(); } catch {}
        soundBackend.noteOn(note, velocity, channel);

        midiTesterOnNoteOn(note, velocity, channel);
    }

    midiService.onNoteOff = (note: number, velocity: number, channel: number) => {
        soundBackend.noteOff(note, velocity, channel);

        midiTesterOnNoteOff(note, velocity, channel);
    }

    midiService.onControlChange = (_controller: number, _value: number, _channel: number) => {
        midiTesterOnCC(_controller, _value, _channel);
    }
}