import { SMPCharacteristic, MGMT_OP } from '../SMPCharacteristic';
import { Log } from '../../utilities';

let log = new Log('basic_mgr', Log.LEVEL_DEBUG);

enum _MGMT_ID {
    POLL = 0,
}

export class BasicManager {
    private readonly GROUP_ID = 101;
    private mcumgr: SMPCharacteristic;

    constructor(mcumgr: SMPCharacteristic) {
        this.mcumgr = mcumgr;
    }

    async poll(): Promise<void> {
        log.debug('Polling');
        const response = await this.mcumgr.sendMessage(MGMT_OP.WRITE, this.GROUP_ID, _MGMT_ID.POLL);
        log.debug(`Received response: ${response}`);
        return;
    }
}

