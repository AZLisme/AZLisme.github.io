// Shared contract for model suggestions, manual review, and publication.
// Coordinates describe the current corrected page image, not the original photo.
const KINDS = new Set(['narration', 'speech', 'label']);
function fail(errors) {
  const error = new Error(errors.join('\n'));
  error.validationErrors = errors;
  throw error;
}
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function warningsOf(raw) {
  if(raw.warnings === undefined) return [];
  if(!Array.isArray(raw.warnings)||raw.warnings.some(value=>typeof value!=='string')) fail(['warnings 必须是文字数组。']);
  return raw.warnings.map(value=>value.trim()).filter(Boolean);
}
export function validateRegions(regions) {
  if(!Array.isArray(regions)||regions.length===0) fail(['每句至少需要一个文字区域。']);
  const errors=[];
  const normalized=regions.map((region,index)=>{
    if(!record(region)||!['x','y','w','h'].every(key=>finite(region[key]))) {errors.push(`区域 ${index+1} 必须包含数值 x、y、w、h。`);return null}
    const {x,y,w,h}=region;
    if(x<0||y<0||w<=0||h<=0||x>1||y>1||w>1||h>1||x+w>1.000000001||y+h>1.000000001)errors.push(`区域 ${index+1} 必须在校正图 0–1 坐标内，宽高大于 0。`);
    return {x,y,w,h};
  });
  if(errors.length)fail(errors);
  return normalized;
}
/** Preserve sentence order supplied by the model; never invent ids or reorder. */
export function validateAnalysis(raw) {
  if(!record(raw)||!Array.isArray(raw.sentences))fail(['分析结果必须包含 sentences 数组。']);
  if(raw.sentences.length>2000)fail(['单页句子数量超过限制，请拆分页面。']);
  const errors=[],sentences=raw.sentences.map((sentence,index)=>{
    const label=`第 ${index+1} 句`;
    if(!record(sentence)){errors.push(`${label}格式无效。`);return null}
    if(!nonempty(sentence.en))errors.push(`${label}缺少英文。`);
    if(!nonempty(sentence.zh))errors.push(`${label}缺少中文翻译。`);
    const kind=sentence.kind===undefined?'narration':sentence.kind;
    if(!KINDS.has(kind))errors.push(`${label}kind 必须是 narration、speech 或 label。`);
    const includeInNarration=sentence.includeInNarration===undefined?true:sentence.includeInNarration;
    if(typeof includeInNarration!=='boolean')errors.push(`${label}includeInNarration 必须是布尔值。`);
    let regions=[];
    try{regions=validateRegions(sentence.regions)}catch(error){errors.push(...error.validationErrors.map(message=>`${label}：${message}`))}
    return {en:typeof sentence.en==='string'?sentence.en.trim():'',zh:typeof sentence.zh==='string'?sentence.zh.trim():'',regions,kind,includeInNarration};
  });
  const warnings=warningsOf(raw);
  if(errors.length)fail(errors);
  return {sentences,warnings};
}
export function validateCorners(raw) {
  if(!record(raw))fail(['四角结果必须是对象。']);
  const warnings=warningsOf(raw);
  if(raw.corners===null) {
    if(!warnings.length)fail(['未检测到四角时，请在 warnings 中说明原因。']);
    return {corners:null,warnings};
  }
  if(!Array.isArray(raw.corners)||raw.corners.length!==4)fail(['四角必须包含左上、右上、右下、左下四个坐标。']);
  const corners=raw.corners.map((point,index)=>{
    if(!record(point)||!finite(point.x)||!finite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1)fail([`角点 ${index+1} 必须使用 0–1 数值坐标。`]);
    return {x:point.x,y:point.y};
  });
  const crosses=corners.map((point,index)=>{
    const next=corners[(index+1)%4],after=corners[(index+2)%4];
    return (next.x-point.x)*(after.y-next.y)-(next.y-point.y)*(after.x-next.x);
  });
  const area=corners.reduce((sum,point,index)=>{const next=corners[(index+1)%4];return sum+point.x*next.y-next.x*point.y},0)/2;
  if(crosses.some(value=>value<=0.0001)||area<0.025)fail(['四角须按左上、右上、右下、左下形成不交叉的凸四边形，不能重叠或过于接近。']);
  // Validate the declared starting point and directions without silently sorting.
  const [tl,tr,br,bl]=corners;
  if((tl.x+bl.x)>=(tr.x+br.x)||(tl.y+tr.y)>=(bl.y+br.y))fail(['四角顺序须为左上、右上、右下、左下。']);
  return {corners,warnings};
}
export function isPageRectified(page) {
  return page?.rectificationReviewed===true&&page.rectificationRevision===(page.imageRevision||0);
}
export function sentenceIssues(sentence,page) {
  const errors=[];
  if(!isPageRectified(page))errors.push('页面校正尚未确认或图片已改变');
  if(sentence?.reviewed!==true)errors.push('句子尚未人工审核');
  if(!nonempty(sentence?.en))errors.push('缺少英文');
  if(!nonempty(sentence?.zh))errors.push('缺少中文翻译');
  if(sentence?.kind!==undefined&&!KINDS.has(sentence.kind))errors.push('文字类型无效');
  if(sentence?.includeInNarration!==undefined&&typeof sentence.includeInNarration!=='boolean')errors.push('朗读开关无效');
  if(sentence?.anchorRevision!==(page?.imageRevision||0))errors.push('文字位置不属于当前图片，请重新定位审核');
  try{validateRegions(sentence?.regions)}catch{errors.push('缺少有效文字区域，请定位文字')}
  return errors;
}
/** Ready for narration only when includeInNarration !== false is also checked. */
export function isSentenceReady(sentence,page) {return sentenceIssues(sentence,page).length===0}
