export const TICKS_PER_BEAT = 24;
export const NUM_PAGES = 10;
export const LOOPS_PER_PAGE = 15;

export function encodeAsciiString(str: string, maxLength: number): Uint8Array {
  if (str.length > maxLength) throw new Error(`String "${str}" is longer than maxLength ${maxLength}`);
  for (let i = 0; i < str.length; i++) { const code = str.charCodeAt(i); if (code > 255) throw new Error(`Character '${str[i]}' (code ${code}) is not 8-bit ASCII`); }
  const result = new Uint8Array(maxLength);
  for (let i = 0; i < maxLength; i++) result[i] = i < str.length ? str.charCodeAt(i) : 0;
  return result;
}

export function decodeAsciiString(data: Uint8Array): string { let r=''; for (let i=0;i<data.length;i++){const b=data[i]; if (b===0) break; r+=String.fromCharCode(b);} return r; }

class ByteArray { data: number[] = []; push8(v:number){ if(v<0||v>0xFF) throw new RangeError(); this.data.push(v&0xFF);} push16(v:number){ if(v<0||v>0xFFFF) throw new RangeError(); this.data.push(v&0xFF, (v>>8)&0xFF);} push32(v:number){ if(v<0||v>0xFFFFFFFF) throw new RangeError(); this.data.push(v&0xFF,(v>>8)&0xFF,(v>>16)&0xFF,(v>>24)&0xFF);} pop8():number{ if(this.data.length<1) throw new RangeError(); return this.data.shift()!;} pop16():number{ if(this.data.length<2) throw new RangeError(); const l=this.data.shift()!; const m=this.data.shift()!; return l | (m<<8);} pop32():number{ if(this.data.length<4) throw new RangeError(); const b0=this.data.shift()!,b1=this.data.shift()!,b2=this.data.shift()!,b3=this.data.shift()!; return (b0 | (b1<<8) | (b2<<16) | (b3<<24))>>>0;} add(o:ByteArray){ this.data.push(...o.data);} static from(a:Uint8Array){ const b=new ByteArray(); b.data=Array.from(a); return b; } }

export interface DrumEvent { note:number; time_ticks_press:number; velocity:number; time_ticks_release:number } // note: 7 bits, time_ticks_press: 9 bits, velocity: 7 bits, time_ticks_release: 9 bits
export interface LoopData { length_beats:number; events:DrumEvent[] } // length_beats: 1 byte, [num_events]: 1 byte, events: 1 byte per event
export interface SamplePack { name:string; loops: (LoopData | null)[] } // name: 8 bytes, loops: 15 loops
export interface DeviceSamples { reserved0?:number; reserved1?:number; reserved2?:number; reserved3?:number; pages:(SamplePack|null)[] } // reserved0: 4 bytes, reserved1: 4 bytes, reserved2: 4 bytes, reserved3: 4 bytes, pages: 10 packs

function packDrumEvent(e:DrumEvent):[number,number]{ if(e.note<0||e.note>127) throw new RangeError(); if(e.time_ticks_press<0||e.time_ticks_press>511) throw new RangeError(); if(e.velocity<0||e.velocity>127) throw new RangeError(); if(e.time_ticks_release<0||e.time_ticks_release>511) throw new RangeError(); const w0=(e.note&0x7F)|((e.time_ticks_press&0x1FF)<<7); const w1=(e.velocity&0x7F)|((e.time_ticks_release&0x1FF)<<7); return [w0,w1]; }
function unpackDrumEvent(w0:number,w1:number):DrumEvent{ return { note: w0 & 0x7F, time_ticks_press: (w0>>7)&0x1FF, velocity: w1 & 0x7F, time_ticks_release: (w1>>7)&0x1FF }; }

export function samplesParser_encode(deviceSamples: DeviceSamples): Uint8Array {
  /* mutate object before encoding */
  const mutDeviceSamples = structuredClone(deviceSamples);
  /* rotate pages one up and wrap. First pack on MONKEY is key 0 */
  mutDeviceSamples.pages.unshift(mutDeviceSamples.pages.pop()||null);
  
  let d=new ByteArray(); d.push32(mutDeviceSamples.reserved0 ?? 0xFFFFFFFF); d.push32(mutDeviceSamples.reserved1 ?? 0xFFFFFFFF); d.push32(mutDeviceSamples.reserved2 ?? 0xFFFFFFFF); d.push32(mutDeviceSamples.reserved3 ?? 0xFFFFFFFF);
  const upper:number[] = [], lower:number[] = [];
  for(let i=0;i<NUM_PAGES;i++){ const page=mutDeviceSamples.pages[i]; if(page===null){ upper.push(0xFFFFFFFF>>>0); lower.push(0xFFFFFFFF>>>0); continue;} mutDeviceSamples.pages[i]!.name = mutDeviceSamples.pages[i]!.name.replace("-", ""); const nameBytes=encodeAsciiString(page.name||"",8); const lo=(nameBytes[0])|(nameBytes[1]<<8)|(nameBytes[2]<<16)|(nameBytes[3]<<24); const hi=(nameBytes[4])|(nameBytes[5]<<8)|(nameBytes[6]<<16)|(nameBytes[7]<<24); upper.push(hi>>>0); lower.push(lo>>>0); }
  for(let i=0;i<NUM_PAGES;i++) d.push32(upper[i]); for(let i=0;i<NUM_PAGES;i++) d.push32(lower[i]);
  let loopOffsets=new ByteArray(), loopData=new ByteArray();
  for(let page_idx=0; page_idx<NUM_PAGES; page_idx++){
    let page=mutDeviceSamples.pages[page_idx]; if(page===null){ for(let i=0;i<LOOPS_PER_PAGE;i++) loopOffsets.push16(0xFFFF); continue; }
    for(let loop_idx=0; loop_idx<LOOPS_PER_PAGE; loop_idx++){
      let loop = page.loops[loop_idx] as LoopData | null; if(loop==null){ loopOffsets.push16(0xFFFF); continue; }
      loopOffsets.push16(loopData.data.length);
      loopData.push8(loop.length_beats); loopData.push8(loop.events.length);
      for(const ev of loop.events){ const [w0,w1]=packDrumEvent(ev); loopData.push16(w0); loopData.push16(w1); }
    }
  }
  d.add(loopOffsets); d.add(loopData); return Uint8Array.from(d.data);
}

export function samplesParser_decode(packedData: Uint8Array): DeviceSamples {
  let d=ByteArray.from(packedData); let p:DeviceSamples={ reserved0:d.pop32(), reserved1:d.pop32(), reserved2:d.pop32(), reserved3:d.pop32(), pages:[] };
  const upper:number[]=[], lower:number[]=[]; for(let i=0;i<NUM_PAGES;i++) upper.push(d.pop32()); for(let i=0;i<NUM_PAGES;i++) lower.push(d.pop32());
  for(let i=0;i<NUM_PAGES;i++){ const hi=upper[i]>>>0; const lo=lower[i]>>>0; if(hi===0xFFFFFFFF && lo===0xFFFFFFFF){ p.pages.push(null); continue; } const nameBytes=new Uint8Array(8); nameBytes[0]=lo&0xFF; nameBytes[1]=(lo>>8)&0xFF; nameBytes[2]=(lo>>16)&0xFF; nameBytes[3]=(lo>>24)&0xFF; nameBytes[4]=hi&0xFF; nameBytes[5]=(hi>>8)&0xFF; nameBytes[6]=(hi>>16)&0xFF; nameBytes[7]=(hi>>24)&0xFF; let name=decodeAsciiString(nameBytes); if(name && name.length > 0) name = name[0] + '-' + name.slice(1); p.pages.push({ name, loops: [] as any }); }
  let loopExists:boolean[]=[]; for(let i=0;i<NUM_PAGES*LOOPS_PER_PAGE;i++){ loopExists.push(d.pop16()===0xFFFF?false:true); }
  for(let page_idx=0; page_idx<NUM_PAGES; page_idx++){
    let page=p.pages[page_idx] as any; if(page===null) continue;
    for(let loop_idx=0; loop_idx<LOOPS_PER_PAGE; loop_idx++){
      if(loopExists[page_idx*LOOPS_PER_PAGE+loop_idx]==false){ page.loops.push(null); continue; }
      let loop:LoopData={ length_beats: d.pop8(), events: [] };
      let numEvents=d.pop8(); for(let i=0;i<numEvents;i++){ const w0=d.pop16(); const w1=d.pop16(); loop.events.push(unpackDrumEvent(w0,w1)); }
      page.loops.push(loop);
    }
  }

  /* rotate pages one down and wrap. First pack on MONKEY is key 0 */
  p.pages.push(p.pages.shift()||null);

  return p;
}

export function sampleParser_loopSize(loop: LoopData | null): number { 
  if(loop===null) return 0; 
  return 2 + (loop.events?.length ?? 0) * 4; 
}
export function sampleParser_packSize(page: SamplePack | null): number { 
  if(page===null) return 0; 
  let size=8; 
  page.loops.forEach(loop => size += sampleParser_loopSize(loop)); 
  return size; 
}
export function sampleParser_samplesSize(pack: DeviceSamples): number { 
  let size=16;
  pack.pages.forEach(page=> size+=sampleParser_packSize(page as any)); 
  return size; 
}