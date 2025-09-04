import { SMPService, MGMT_OP } from '../SMPService';
import { Log } from '../../utils/Log';

let log = new Log('basic_mgr', Log.LEVEL_DEBUG);

enum _MGMT_ID {
    POLL = 0,
}

export class BasicManager {
    private readonly GROUP_ID = 101;
    private smpBluetoothCharacteristic: SMPService;

    constructor(smpBluetoothCharacteristic: SMPService) {
        this.smpBluetoothCharacteristic = smpBluetoothCharacteristic;
    }

    async poll(): Promise<void> {
        log.debug('Polling');
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.WRITE, this.GROUP_ID, _MGMT_ID.POLL);
        log.debug(`Received response: ${response}`);
        return;
    }
}

