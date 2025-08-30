export const assert = (condition: boolean, message: string) => {
  if (!condition) { throw new Error(`Assertion failed: ${message}`); }
}

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

export const imageHash = (image: ArrayBuffer) => crypto.subtle.digest('SHA-256', image);

export const imageInfo = async (image: ArrayBuffer) => {
  const info: any = {}; const view = new Uint8Array(image);
  if (view.length < 32) throw new Error('Invalid image (too short file)');
  if (view[0] !== 0x3d || view[1] !== 0xb8 || view[2] !== 0xf3 || view[3] !== 0x96) throw new Error('Invalid image (wrong magic bytes)');
  if (view[4] || view[5] || view[6] || view[7]) throw new Error('Invalid image (wrong load address)');
  const headerSize = view[8] + view[9] * 2 ** 8;
  if (view[10] || view[11]) throw new Error('Invalid image (wrong protected TLV area size)');
  const imageSize = view[12] + view[13] * 2 ** 8 + view[14] * 2 ** 16 + view[15] * 2 ** 24; info.imageSize = imageSize;
  if (view.length < imageSize + headerSize) throw new Error('Invalid image (wrong image size)');
  if (view[16] || view[17] || view[18] || view[19]) throw new Error('Invalid image (wrong flags)');
  const version = `${view[20]}.${view[21]}.${view[22] + view[23] * 2 ** 8}`; info.version = version;
  info.hash = [...new Uint8Array(await imageHash(image.slice(0, imageSize + 32)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return info;
}

export function canonicalize(obj: any): any {
  if (Array.isArray(obj)) return obj.map(canonicalize);
  else if (obj && typeof obj === 'object') { const sortedKeys = Object.keys(obj).sort(); const result: any = {}; for (const key of sortedKeys) result[key] = canonicalize(obj[key]); return result; }
  else return obj;
}

