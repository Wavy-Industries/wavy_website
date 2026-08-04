// Generative "museum wall" for the MONKEY page.
//
// A domain-warped value-noise field, posterised through a hand-built colour
// ramp with an 8x8 Bayer dither so the banding reads as print/CRT texture
// rather than gradient steps. The expensive noise runs on a half-resolution
// lattice and is bilinearly upsampled, so a full frame at 1440x900 costs
// about 5 ms; the caller is expected to drive it well under 60fps.

// ---- value noise -----------------------------------------------------
const P = new Uint8Array(512);
(function seed(){
  const r = (function(s){return function(){s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;}})(1337);
  const t = new Uint8Array(256);
  for (let i=0;i<256;i++) t[i]=i;
  for (let i=255;i>0;i--){const j=(r()*(i+1))|0;const x=t[i];t[i]=t[j];t[j]=x;}
  for (let i=0;i<512;i++) P[i]=t[i&255];
})();
function vn(x, y, z){
  const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
  const xf=x-xi, yf=y-yi, zf=z-zi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf), w=zf*zf*(3-2*zf);
  const X=xi&255, Y=yi&255, Z=zi&255;
  const h=(a,b,c)=>P[(P[(P[a]+b)&255]+c)&255]/255;
  const c000=h(X,Y,Z),       c100=h(X+1,Y,Z);
  const c010=h(X,Y+1,Z),     c110=h(X+1,Y+1,Z);
  const c001=h(X,Y,Z+1),     c101=h(X+1,Y,Z+1);
  const c011=h(X,Y+1,Z+1),   c111=h(X+1,Y+1,Z+1);
  const x00=c000+(c100-c000)*u, x10=c010+(c110-c010)*u;
  const x01=c001+(c101-c001)*u, x11=c011+(c111-c011)*u;
  const y0=x00+(x10-x00)*v, y1=x01+(x11-x01)*v;
  return y0+(y1-y0)*w;
}
function fbm(x,y,z){
  let s=0, a=0.5, f=1;
  for(let o=0;o<3;o++){ s+=a*vn(x*f,y*f,z*f); f*=2.03; a*=0.5; }
  return s/0.875;
}

// ---- palette: ink -> indigo -> cobalt -> cyan -> ice, warm amber core -
const STOPS = [
  [0.00, [  4,  6, 13]],
  [0.16, [  9, 15, 40]],
  [0.32, [ 15, 33, 82]],
  [0.46, [ 20, 60,132]],
  [0.58, [ 27, 96,178]],
  [0.68, [ 44,140,212]],
  [0.78, [ 92,186,232]],
  [0.86, [158,216,240]],
  [0.93, [206,230,240]],
  [0.975,[240,220,170]],
  [1.00, [250,198,110]],
];
const LUT_N = 256;
const LUT = new Uint32Array(LUT_N);
for (let i=0;i<LUT_N;i++){
  const t=i/(LUT_N-1);
  let k=0; while(k<STOPS.length-2 && t>STOPS[k+1][0]) k++;
  const [t0,c0]=STOPS[k], [t1,c1]=STOPS[k+1];
  const f=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));
  const r=c0[0]+(c1[0]-c0[0])*f, g=c0[1]+(c1[1]-c0[1])*f, b=c0[2]+(c1[2]-c0[2])*f;
  LUT[i]=(255<<24)|(b<<16)|(g<<8)|r;
}
// 8x8 Bayer, so the quantisation reads as print/CRT dither rather than bands
const BAYER=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
             3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
const LEVELS = 11;                       // posterisation steps

export function makeField() {
  let cols=0, rows=0, cw=0, ch=0, coarse=null;
  function resize(c, r){
    cols=c; rows=r;
    cw=Math.max(3, (cols>>1)+1); ch=Math.max(3,(rows>>1)+1);
    coarse=new Float32Array(cw*ch);
  }
  function render(px, t){
    // coarse pass: domain-warped fbm, evaluated on a half-res lattice
    const sx=3.2/cw, sy=3.2/cw;           // keep cells square in noise space
    for(let j=0;j<ch;j++){
      for(let i=0;i<cw;i++){
        const x=i*sx, y=j*sy;
        const q1=fbm(x, y, t*0.13);
        const q2=fbm(x+2.7, y+1.3, t*0.11+5.2);
        const r1=fbm(x+2.2*q1+0.9, y+2.2*q2-0.4, t*0.09+11.0);
        let v=fbm(x+2.6*r1, y+2.6*r1+0.7, t*0.07+2.0);
        v=(v-0.32)*1.9;                   // stretch into the palette
        coarse[j*cw+i]=v;
      }
    }
    // fine pass: bilinear upsample + shaped core + vignette + dither
    const bx=cols*0.29, by=rows*0.43;
    const rx=cols*0.46, ry=rows*0.44;     // elliptical, not a bullseye
    const N=LEVELS-1;
    for(let j=0;j<rows;j++){
      const gy=j*0.5, j0=gy|0, fy=gy-j0, j1=Math.min(ch-1,j0+1);
      const dy=(j-by)/ry, ey=(j-rows*0.5)/rows;
      for(let i=0;i<cols;i++){
        const gx=i*0.5, i0=gx|0, fx=gx-i0, i1=Math.min(cw-1,i0+1);
        const a=coarse[j0*cw+i0], b=coarse[j0*cw+i1];
        const c=coarse[j1*cw+i0], d=coarse[j1*cw+i1];
        let v=(a+(b-a)*fx)+((c+(d-c)*fx)-(a+(b-a)*fx))*fy;
        const dx=(i-bx)/rx;
        const core=Math.exp(-(dx*dx+dy*dy)*1.15);
        v=v*0.58+core*0.80;
        const ex=(i-cols*0.5)/cols;
        v*=1.0-Math.min(1,Math.sqrt(ex*ex+ey*ey)*1.72);
        // ordered dither before posterising
        const dth=(BAYER[((j&7)<<3)|(i&7)]/64-0.5)*0.72/N;
        let q=Math.round((v+dth)*N)/N;
        if(q<0)q=0; else if(q>1)q=1;
        px[j*cols+i]=LUT[(q*(LUT_N-1))|0];
      }
    }
  }
  return { resize, render };
}
