// Local DocAligner neural corner detection; images never leave this browser.
// Perspective correction cannot flatten a curved book spine.
let worker, pending, serial = Promise.resolve(), sequence = 0;
const MAX_OUTPUT = 4096;
function request(type, data, transfer = []) {
  if (!worker) {
    worker = new Worker(new URL('./scanner-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({data}) => {
      if (!pending || data.id !== pending.id) return;
      const p = pending; pending = null;
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
    };
    worker.onerror = event => { pending?.reject(new Error(event.message || '扫描运行时失败')); pending = null; worker.terminate(); worker = null; };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence; pending = {id, resolve, reject};
    try { worker.postMessage({id, type, ...data}, transfer); }
    catch (error) { pending = null; reject(error); }
  });
}
const enqueue = fn => { const next = serial.catch(()=>{}).then(fn); serial = next; return next; };

function exifOrientation(view, start, size) {
  try {
    if (size < 14 || view.getUint32(start) !== 0x45786966) return 1;
    const tiff = start + 6, little = view.getUint16(tiff) === 0x4949;
    if (!little && view.getUint16(tiff) !== 0x4d4d) return 1;
    const ifd = tiff + view.getUint32(tiff + 4, little), count = view.getUint16(ifd, little);
    for (let i=0; i<count; i++) {
      const entry=ifd+2+i*12;
      if (view.getUint16(entry,little)===0x112) return view.getUint16(entry+8,little);
    }
  } catch {}
  return 1;
}
/** Reads JPEG / PNG dimensions without allocating the full decoded photograph. */
export async function getImageInfo(blob) {
  const view = new DataView(await blob.slice(0, 1048576).arrayBuffer());
  let width, height, orientation=1;
  if (view.byteLength>=24 && view.getUint32(0)===0x89504e47 && view.getUint32(4)===0x0d0a1a0a) {
    width=view.getUint32(16); height=view.getUint32(20);
  } else if(view.byteLength>=4 && view.getUint16(0)===0xffd8) {
    let offset=2;
    while(offset+4<=view.byteLength) {
      if(view.getUint8(offset)!==0xff) break;
      while(view.getUint8(offset)===0xff) offset++;
      const marker=view.getUint8(offset++);
      if(marker===0xd9||marker===0xda) break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7)) continue;
      const length=view.getUint16(offset);
      if(length<2||offset+length>view.byteLength) break;
      if(marker===0xe1) orientation=exifOrientation(view,offset+2,length-2);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) { height=view.getUint16(offset+3); width=view.getUint16(offset+5); }
      offset+=length;
    }
  }
  if(!width||!height) throw new Error('无法读取图片尺寸，请使用有效 JPEG 或 PNG。');
  if(width*height>60000000) throw new Error('照片超过 6000 万像素，请先缩小后再导入。');
  if(orientation>=5&&orientation<=8) [width,height]=[height,width];
  return {width,height,orientation};
}
/** The caller owns the returned ImageBitmap and must close() it. */
export async function decodeScaled(blob, maxEdge=1600) {
  const {width,height}=await getImageInfo(blob), scale=Math.min(1,maxEdge/Math.max(width,height));
  return createImageBitmap(blob,{imageOrientation:'from-image',resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale)),resizeQuality:'high'});
}
function canvas(width,height) { const c=document.createElement('canvas');c.width=width;c.height=height;return c; }
function validCorners(points) {
  if(!Array.isArray(points)||points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)) return false;
  const signs=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x)});
  if(signs.some(v=>v<0.0001)) return false;
  const area=Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%4];return sum+p.x*q.y-q.x*p.y},0))/2;
  return area>=0.025;
}
/** Always returns a candidate for review, never applies a crop automatically. */
export function suggestCorners(blob) { return enqueue(async()=> {
  const start=performance.now(), image=await decodeScaled(blob,1600), c=canvas(256,256);
  const width=image.width,height=image.height;
  try {
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const infer=async pad=>{
      const paddedWidth=width+2*pad,paddedHeight=height+2*pad;
      ctx.fillStyle='#333333';ctx.fillRect(0,0,256,256);
      ctx.drawImage(image,pad/paddedWidth*256,pad/paddedHeight*256,width/paddedWidth*256,height/paddedHeight*256);
      const rgba=ctx.getImageData(0,0,256,256).data,tensor=new Float32Array(3*256*256);
      // Author's Python inference accepts OpenCV BGR, CHW, normalized by 255.
      for(let p=0;p<65536;p++){tensor[p]=rgba[p*4+2]/255;tensor[p+65536]=rgba[p*4+1]/255;tensor[p+131072]=rgba[p*4]/255}
      const raw=await request('detect',{tensor},[tensor.buffer]);
      const mapped=raw.corners.map(p=>({x:(p.x*paddedWidth-pad)/width,y:(p.y*paddedHeight-pad)/height}));
      // Slight negative coordinates can come from interpolation at a clipped edge.
      // Do not accept distant padded-background corners as document corners.
      const outside=mapped.some(p=>p.x<-.035||p.x>1.035||p.y<-.035||p.y>1.035);
      const corners=mapped.map(p=>({x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))}));
      const edgeClipped=mapped.some(p=>p.x<.015||p.x>.985||p.y<.015||p.y>.985);
      return {...raw,corners,edgeClipped,valid:!outside&&validCorners(corners),pass:pad?'padded-pass':'original-pass',paddingPixels:pad};
    };
    const first=await infer(0);let result=first;const passes=[first];
    if(!first.valid||first.confidence<.2){
      const second=await infer(Math.round(Math.max(width,height)*.13));passes.push(second);
      if(second.valid&&second.confidence>=.2)result=second;
    }
    const usable=result.valid&&result.confidence>=.2,needsManual=!usable||result.edgeClipped;
    return {...result,corners:usable?result.corners:null,needsManual,method:'AI · DocAligner LCNet',source:`docaligner-lcnet100-heatmap-${result.pass}`,passes:passes.map(p=>({pass:p.pass,confidence:p.confidence,valid:p.valid,edgeClipped:p.edgeClipped})),width,height,elapsedMs:performance.now()-start,warning:!usable?'AI 没有找到可靠的完整书页四角，请手动定位。':result.edgeClipped?'AI 返回可见书页候选，但四角贴近或超出照片边缘，必须手动复核；照片外的内容无法恢复。':'AI 候选四角需要检查；模型可能选中单页或插画边框。书脊弯曲无法通过四点纠偏消除。'};
  } finally { image.close(); c.width=c.height=1; }
}); }
/** Bilinear projective warp with a 4096px decode/output ceiling. */
export function rectify(blob,corners) { return enqueue(async()=> {
  if(!validCorners(corners)) throw new Error('四角必须按左上、右上、右下、左下围成不交叉的有效四边形。');
  const image=await decodeScaled(blob,MAX_OUTPUT), c=canvas(image.width,image.height);
  try {
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,c.width,c.height);
    const result=await request('warp',{pixels,width:c.width,height:c.height,corners},[pixels.data.buffer]);
    const out=canvas(result.width,result.height);
    try {
      out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.buffer),result.width,result.height),0,0);
      return await new Promise((resolve,reject)=>out.toBlob(blob=>blob?resolve(blob):reject(new Error('扫描图片编码失败')),'image/jpeg',0.94));
    } finally { out.width=out.height=1; }
  } finally { image.close(); c.width=c.height=1; }
}); }
export function releaseScanner() { if(pending)throw new Error('扫描任务仍在进行，请完成后释放模型。');worker?.terminate();worker=null; }
export const releaseModels = releaseScanner;
