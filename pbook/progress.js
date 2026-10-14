
'use strict';
class ReadingVoyage {
 constructor(save,now=()=>performance.now()){this.save=save;this.now=now;this.reset(null,0)}
 reset(id,total){this.id=id;this.total=total;this.seen=new Set();this.page=null;this.since=null;this.done=false}
 visit(page,visible=true){this.flush();this.page=page;this.since=visible?this.now():null}
 flush(){if(this.since===null||this.done)return;if(this.now()-this.since>=3000)this.seen.add(this.page);if(this.total&&this.seen.size===this.total){this.done=true;this.save(this.id)}}
 suspend(){this.flush();this.since=null}
 resume(){if(this.page!==null)this.since=this.now()}
}
class ListeningVoyage {
 constructor(audio,save){this.audio=audio;this.save=save;this.reset(null,[]);audio.addEventListener('playing',()=>this.last=audio.currentTime);audio.addEventListener('play',()=>this.last=audio.currentTime);audio.addEventListener('timeupdate',()=>this.tick());for(const event of ['seeking','pause','waiting','stalled'])audio.addEventListener(event,()=>this.last=null)}
 reset(id,segments){this.id=id;this.segments=segments;this.spans=[];this.last=null;this.done=false}
 tick(){const t=this.audio.currentTime;if(!this.audio.paused&&this.last!==null&&t>this.last&&t-this.last<=2.5)this.spans.push([this.last,t]);this.last=this.audio.paused?null:t}
 complete(){this.tick();if(this.done||!this.segments.length)return false;const spans=this.spans.sort((a,b)=>a[0]-b[0]),merged=[];for(const s of spans){const prev=merged.at(-1);if(prev&&s[0]<=prev[1])prev[1]=Math.max(prev[1],s[1]);else merged.push([...s])}const full=this.segments.every(s=>{const duration=s.end-s.start,heard=merged.reduce((n,x)=>n+Math.max(0,Math.min(x[1],s.end)-Math.max(x[0],s.start)),0);return duration>0&&heard>=duration*.85});if(full){this.done=true;this.save(this.id)}return full}
}
function voyageCount(kind,id){try{const n=Number(localStorage.getItem('picturebook:voyage:'+kind+':'+id));return Number.isFinite(n)?Math.max(0,Math.floor(n)):0}catch{return 0}}
function saveVoyage(kind,id){if(!id)return;try{localStorage.setItem('picturebook:voyage:'+kind+':'+id,String(voyageCount(kind,id)+1))}catch{}if(typeof drawVoyages==='function')drawVoyages()}
function princeBoat(){return `<svg viewBox="0 0 150 120" aria-hidden="true" class="princeBoat"><g class="boatBob"><path d="M25 88 Q72 116 130 88 L116 110 Q72 126 40 108Z" fill="#e7ad60" stroke="#816044" stroke-width="3"/><path d="M30 92 Q77 109 125 92" fill="none" stroke="#fff0c3" stroke-width="4"/><path d="M66 76 Q50 89 58 96 L83 96 L84 73" fill="#79b5a6" stroke="#416d61" stroke-width="3"/><circle cx="74" cy="51" r="17" fill="#ffdfaf" stroke="#a98562" stroke-width="2"/><path d="M57 49 L51 39 L61 38 L59 27 L72 34 L83 24 L86 36 L99 34 L93 48 L83 42 L69 44Z" fill="#ffd45d" stroke="#d6a347" stroke-width="2"/><circle cx="78" cy="52" r="2" fill="#465b60"/><path d="M77 60 Q82 63 86 59" fill="none" stroke="#986555" stroke-width="2"/><path d="M60 69 Q81 77 89 65 L84 79 L65 78Z" fill="#f7cf52"/><path class="sailScarf" d="M63 73 Q39 65 33 77 Q44 76 51 88 L65 78Z" fill="#f7cf52"/><g class="rowingArm"><path d="M81 78 Q93 82 103 75" fill="none" stroke="#ffdfaf" stroke-width="7" stroke-linecap="round"/><path d="M94 63 L128 110" stroke="#8b654c" stroke-width="4" stroke-linecap="round"/><path d="M120 100 Q138 103 138 116 Q125 120 121 108Z" fill="#b98555" stroke="#8b654c" stroke-width="2"/></g></g></svg>`}
