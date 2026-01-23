export class Log {
  static LEVEL_DEBUG = 0; static LEVEL_INFO = 1; static LEVEL_IMPORTANT = 2; static LEVEL_WARNING = 3; static LEVEL_ERROR = 4;
  static LEVEL_STRING = {0: 'DEBUG', 1: 'INFO', 2: 'WARNING', 3: 'ERROR', 4: 'IMPORTANT'}
  static #LEVEL_DEBUG_COLOR = 'gray'; static #LEVEL_INFO_COLOR = 'white'; static #LEVEL_WARNING_COLOR = 'yellow'; static #LEVEL_ERROR_COLOR = 'red'; static #LEVEL_IMPORTANT_COLOR = 'cyan';
  static #LEVEL_PROD = this.LEVEL_WARNING;
  static #NOOP = () => {};
  #name: string; #level: number;
  constructor(name: string, level: number) { this.#name = name; this.#level = level; this.important(`LOG ${name} - ${Log.LEVEL_STRING[level]}`) }
  get debug(): (...messages: any[]) => void { return this.#createLogger(Log.LEVEL_DEBUG, Log.#LEVEL_DEBUG_COLOR); }
  get info(): (...messages: any[]) => void { return this.#createLogger(Log.LEVEL_INFO, Log.#LEVEL_INFO_COLOR); }
  get warning(): (...messages: any[]) => void { return this.#createLogger(Log.LEVEL_WARNING, Log.#LEVEL_WARNING_COLOR); }
  get error(): (...messages: any[]) => void { return this.#createLogger(Log.LEVEL_ERROR, Log.#LEVEL_ERROR_COLOR); }
  get important(): (...messages: any[]) => void { return this.#createLogger(Log.LEVEL_IMPORTANT, Log.#LEVEL_IMPORTANT_COLOR); }
  // Create per-level loggers so console callsites point to the caller, not Log.ts.
  #createLogger(level: number, color: string): (...messages: any[]) => void {
    if (import.meta.env.PROD && Log.#LEVEL_PROD > this.#level) return Log.#NOOP;
    if (this.#level > level) return Log.#NOOP;
    let callsite = '';
    if (import.meta.env.DEV) {
      const stack = new Error().stack;
      if (stack) {
        const stackLines = stack.split('\n').slice(1).map((line) => line.trim());
        const callLine = stackLines.find((line) => !line.includes('Log.ts') && !line.includes('Log.'));
        if (callLine) {
          const match = callLine.match(/(?:at\s+.*\()?(?<file>[^)]+?):(?<line>\d+):(?<column>\d+)\)?$/);
          if (match?.groups?.file) {
            const rawFile = match.groups.file.split('?')[0];
            const fileName = rawFile.split('/').pop() ?? rawFile;
            callsite = `${fileName} `;
          }
        }
      }
    }
    const prefix = `%c[ ${this.#name} ]`;
    return console.log.bind(console, prefix, `color: ${color}`);
  }
}
  
