export class Log {
    static LEVEL_DEBUG = 0; static LEVEL_INFO = 1; static LEVEL_WARNING = 2; static LEVEL_ERROR = 3; static LEVEL_IMPORTANT = 4;
    static #LEVEL_DEBUG_COLOR = 'gray'; static #LEVEL_INFO_COLOR = 'white'; static #LEVEL_WARNING_COLOR = 'yellow'; static #LEVEL_ERROR_COLOR = 'red'; static #LEVEL_IMPORTANT_COLOR = 'blue';
    #name: string; #level: number;
    constructor(name: string, level: number) { this.#name = name; this.#level = level; }
    #print(message: any, color: string) { if (typeof message === 'object') { console.log(`%c${this.#name}: ⬇︎`, `color: ${color}`); console.log(message); return; } console.log(`%c${this.#name}: ${message}`, `color: ${color}`); }
    debug(message: any){ if (this.#level <= Log.LEVEL_DEBUG) this.#print(message, Log.#LEVEL_DEBUG_COLOR); }
    info(message: any){ if (this.#level <= Log.LEVEL_INFO) this.#print(message, Log.#LEVEL_INFO_COLOR); }
    warning(message: any){ if (this.#level <= Log.LEVEL_WARNING) this.#print(message, Log.#LEVEL_WARNING_COLOR); }
    error(message: any){ if (this.#level <= Log.LEVEL_ERROR) this.#print(message, Log.#LEVEL_ERROR_COLOR); }
    important(message: any){ if (this.#level <= Log.LEVEL_IMPORTANT) this.#print(message, Log.#LEVEL_IMPORTANT_COLOR); }
  }
  