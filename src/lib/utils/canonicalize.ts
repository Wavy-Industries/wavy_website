export function canonicalize(obj: any): any {
    if (Array.isArray(obj)) return obj.map(canonicalize);
    else if (obj && typeof obj === 'object') { const sortedKeys = Object.keys(obj).sort(); const result: any = {}; for (const key of sortedKeys) result[key] = canonicalize(obj[key]); return result; }
    else return obj;
  }
  
  