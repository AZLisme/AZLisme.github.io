'use strict';
class StoryPlayer {
 constructor(audio,callbacks={}){this.audio=audio;this.cb=callbacks;this.book=null;this.base='';this.mode='idle';this.auto=false;this.pageIndex=0;this.end=Infinity;this.token=0;this.frame=null;this.speed=1;this.turnTimer=null;this.turning=false;this.turnDelay=3000;
  audio.addEventListener('timeupdate',()=>this.tick());audio.addEventListener('ended',()=>this.finish());audio.addEventListener('play',()=>{this.state();this.animate()});audio.addEventListener('pause',()=>this.state());audio.addEventListener('error',()=>this.fail('音频加载失败，请检查网络后重试。'));
 }
 setSpeed(speed){if(![0.5,0.75,1,1.5,2].includes(speed))return false;this.speed=speed;this.audio.defaultPlaybackRate=speed;this.audio.playbackRate=speed;this.audio.preservesPitch=true;return true}
 load(book,base){this.stop();this.book=book;this.base=base;this.timeline=(book.narration?.pages||[]).map(p=>({...p,index:book.pages.findIndex(x=>x.id===p.pageId)})).filter(p=>p.index>=0)}
 state(){this.cb.onState?.({auto:this.auto,paused:this.audio.paused,mode:this.mode,turning:this.turning})}
 clearTurn(){if(this.turnTimer!==null)clearTimeout(this.turnTimer);this.turnTimer=null;this.turning=false}
 turnTo(r){this.clearTurn();const token=++this.token;this.turning=true;this.audio.pause();this.audio.currentTime=r.start;this.pageIndex=r.index;this.cb.onSentence?.(null);this.cb.onPage?.(r.index);this.state();this.turnTimer=setTimeout(()=>{this.turnTimer=null;if(token!==this.token||!this.auto||!this.turning)return;this.turning=false;this.state();try{Promise.resolve(this.audio.play()).catch(()=>{if(token===this.token)this.fail('请点击朗读继续。')})}catch{this.fail('请点击朗读继续。')}},this.turnDelay)}
 stop(){this.clearTurn();++this.token;this.auto=false;this.mode='idle';this.end=Infinity;this.audio.pause();this.cb.onSentence?.(null);this.state();if(this.frame!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.frame);this.frame=null}
 fail(message){this.stop();this.cb.onError?.(message)}
 pause(){this.clearTurn();this.audio.pause();this.state()}
 range(index){return this.timeline.find(p=>p.index===index)}
 start(start,end,mode,index){this.clearTurn();const token=++this.token;this.mode=mode;this.pageIndex=index;this.end=end;const src=new URL(this.book.narration.src,this.base).href;
  if(this.audio.src!==src){this.audio.src=src;const seek=()=>{if(token===this.token)this.audio.currentTime=start};this.audio.addEventListener('loadedmetadata',seek,{once:true});try{this.audio.currentTime=start}catch{}}
  else this.audio.currentTime=start;
  this.setSpeed(this.speed);this.cb.onPage?.(index,{silent:mode==='auto'});this.cb.onError?.('');this.state();
  // Call play synchronously from the user's gesture; don't await metadata first.
  let promise;try{promise=this.audio.play()}catch{this.fail('请再次点击播放以开始朗读。');return Promise.resolve(false)}
  return Promise.resolve(promise).then(()=>token===this.token).catch(()=>{if(token===this.token)this.fail('浏览器暂停了播放，请点击自动或朗读按钮重试。');return false})
 }
 playPage(index,restart=false){if(this.turning&&!restart&&index===this.pageIndex){this.pause();return Promise.resolve(true)}const r=this.range(index);if(!r)return Promise.resolve(false);
  if(!restart&&this.pageIndex===index&&['page','auto'].includes(this.mode)&&this.audio.currentTime>=r.start&&this.audio.currentTime<r.end){
   if(!this.audio.paused){this.pause();return Promise.resolve(true)}
   // Resume retains continuous mode when auto is still selected.
   const token=++this.token;try{return Promise.resolve(this.audio.play()).catch(()=>{if(token===this.token)this.fail('请再次点击播放。');return false})}catch{if(token===this.token)this.fail('请再次点击播放。');return Promise.resolve(false)}
  }
  this.auto=false;this.cb.onSentence?.(null);return this.start(r.start,r.end,'page',index)
 }
 playSentence(index,s){this.auto=false;this.cb.onSentence?.(s.id);return this.start(s.start,s.end,'sentence',index)}
 toggleAuto(index){if(this.auto){this.auto=false;this.pause();this.mode='page';this.end=this.range(this.pageIndex)?.end??Infinity;this.state();return Promise.resolve(true)}
  const r=this.timeline.find(p=>p.index>=index);if(!r){this.cb.onError?.('后面没有可朗读的故事页了。');return Promise.resolve(false)}
  this.auto=true;this.cb.onSentence?.(null);return this.start(r.start,this.timeline.at(-1).end,'auto',r.index)
 }
 finish(){this.clearTurn();const wasAuto=this.auto;this.auto=false;this.mode='idle';this.audio.pause();this.cb.onSentence?.(null);this.state();if(wasAuto)this.cb.onComplete?.()}
 tick(){if(this.mode==='idle'||this.audio.paused||this.turning)return;let t=this.audio.currentTime;
  if(t>=this.end-.015){this.finish();return}
  if(this.auto){const current=this.range(this.pageIndex);if(current&&t>=current.end-.015){const next=this.timeline[this.timeline.indexOf(current)+1];if(next)this.turnTo(next);else this.finish();return}}
  // Filter the original track in media time, keeping only selected narration.
  if(this.book.narration?.segments&&this.mode!=='sentence'){
   const segments=this.book.narration.segments.filter(s=>this.auto||s.pageId===this.book.pages[this.pageIndex].id);
   const current=segments.find(s=>t>=s.start&&t<s.end);
   if(!current){const next=segments.find(s=>s.start>=t);if(!next){this.finish();return}if(this.auto&&next.pageId!==this.book.pages[this.pageIndex].id){const r=this.timeline.find(p=>p.pageId===next.pageId);if(r){this.turnTo(r);return}}this.audio.currentTime=t=next.start}
  }
  if(this.auto){const r=[...this.timeline].reverse().find(p=>t>=p.start);if(r&&r.index!==this.pageIndex){this.turnTo(r);return}}
  if(this.mode!=='sentence'){const s=this.book.pages[this.pageIndex]?.sentences?.find(s=>t>=s.start&&t<s.end);this.cb.onSentence?.(s?.id??null)}
  if(t>=this.end-.015)this.finish()
 }
 animate(){if(typeof requestAnimationFrame!=='function')return;if(this.frame!==null)cancelAnimationFrame(this.frame);const loop=()=>{this.tick();if(!this.audio.paused&&this.mode!=='idle')this.frame=requestAnimationFrame(loop);else this.frame=null};this.frame=requestAnimationFrame(loop)}
}
if(typeof module!=='undefined')module.exports=StoryPlayer;
