// DocAligner heatmap preprocessing / decoding follows quadscan (MIT).
// Model: DocsaidLab DocAligner (Apache-2.0). See scanner-assets/SOURCES.json.
import * as ort from '../ipad-ocr-test/assets/ort.bundle.min-DjODQCIR.js';
let model;
async function detect(tensor) {
  if(!model) {
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
    ort.env.wasm.wasmPaths=new URL('../ipad-ocr-test/vendor/',import.meta.url).href;
    model=ort.InferenceSession.create(new URL('./scanner-assets/lcnet100_h_e_bifpn_256_fp32.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'}).catch(error=>{model=null;throw error});
  }
  const session=await model;
  const output=await session.run({img:new ort.Tensor('float32',tensor,[1,3,256,256])});
  const map=output.heatmap;
  if(!map||map.dims.join(',')!=='1,4,128,128') throw new Error('边框模型输出格式不符合预期。');
  const points=[];
  for(let channel=0;channel<4;channel++) {
    const off=channel*16384;let peak=-Infinity,index=0;
    for(let i=0;i<16384;i++){if(map.data[off+i]>peak){peak=map.data[off+i];index=i}}
    const px=index%128,py=Math.floor(index/128);let weights=0,sx=0,sy=0;
    for(let y=Math.max(0,py-4);y<=Math.min(127,py+4);y++)for(let x=Math.max(0,px-4);x<=Math.min(127,px+4);x++){const v=map.data[off+y*128+x];if(v>=peak*.3){weights+=v;sx+=x*v;sy+=y*v}}
    points.push({x:(weights?sx/weights:px)/128,y:(weights?sy/weights:py)/128,score:peak});
  }
  // Heatmap channels are ordered by the model, but normalize clockwise geometry
  // and rotate to the upper-left. This does not substitute a rectangle.
  const center={x:points.reduce((s,p)=>s+p.x,0)/4,y:points.reduce((s,p)=>s+p.y,0)/4};
  points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  const start=points.reduce((best,p,i)=>p.x+p.y<points[best].x+points[best].y?i:best,0);
  const ordered=points.slice(start).concat(points.slice(0,start));
  return {corners:ordered.map(({x,y})=>({x,y})),confidence:Math.min(...points.map(p=>p.score)),cornerScores:ordered.map(p=>p.score)};
}
function homography(src,dst) {
  const m=[];
  for(let i=0;i<4;i++){const {x,y}=src[i],{x:u,y:v}=dst[i];m.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v])}
  for(let c=0;c<8;c++){
    let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(m[r][c])>Math.abs(m[pivot][c]))pivot=r;
    if(Math.abs(m[pivot][c])<1e-12)throw new Error('四角过于接近或共线，无法纠偏。');
    [m[c],m[pivot]]=[m[pivot],m[c]];const div=m[c][c];for(let j=c;j<9;j++)m[c][j]/=div;
    for(let r=0;r<8;r++){if(r===c)continue;const k=m[r][c];for(let j=c;j<9;j++)m[r][j]-=k*m[c][j]}
  }
  return [...m.map(r=>r[8]),1];
}
function warp({pixels,width,height,corners}) {
  const src=corners.map(p=>({x:p.x*(width-1),y:p.y*(height-1)})),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  let w=Math.max(2,Math.round(Math.max(dist(src[0],src[1]),dist(src[3],src[2])))+1),h=Math.max(2,Math.round(Math.max(dist(src[0],src[3]),dist(src[1],src[2])))+1);
  const scale=Math.min(1,4096/Math.max(w,h));w=Math.round(w*scale);h=Math.round(h*scale);
  const H=homography([{x:0,y:0},{x:w-1,y:0},{x:w-1,y:h-1},{x:0,y:h-1}],src),out=new Uint8ClampedArray(w*h*4),data=pixels.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const d=H[6]*x+H[7]*y+1,sx=Math.max(0,Math.min(width-1,(H[0]*x+H[1]*y+H[2])/d)),sy=Math.max(0,Math.min(height-1,(H[3]*x+H[4]*y+H[5])/d));
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),tx=sx-x0,ty=sy-y0,idx=(y*w+x)*4;
    for(let ch=0;ch<3;ch++){const a=data[(y0*width+x0)*4+ch]*(1-tx)+data[(y0*width+x1)*4+ch]*tx,b=data[(y1*width+x0)*4+ch]*(1-tx)+data[(y1*width+x1)*4+ch]*tx;out[idx+ch]=a*(1-ty)+b*ty}out[idx+3]=255;
  }
  return {width:w,height:h,buffer:out.buffer};
}
self.onmessage=async({data})=>{try{const result=data.type==='detect'?await detect(data.tensor):warp(data);self.postMessage({id:data.id,result},result.buffer?[result.buffer]:[])}catch(error){self.postMessage({id:data.id,error:error.message||String(error)})}};
