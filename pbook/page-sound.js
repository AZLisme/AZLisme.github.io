'use strict';
class PageTurnSound {
 constructor(){this.context=null;this.source=null;this.buffer=null;this.loading=null;this.data=null;if(typeof document!=='undefined')this.data=fetch(new URL('assets/paper-page-turn-v1.mp3',document.baseURI)).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer()}).catch(()=>null)}
 unlock(){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;this.context??=new Context();if(this.context.state==='suspended')this.context.resume().catch(()=>{});if(!this.loading&&this.data)this.loading=this.data.then(data=>data?this.context.decodeAudioData(data):null).then(buffer=>{this.buffer=buffer}).catch(()=>{})}catch{}}
 play(){this.unlock();const ctx=this.context;if(!ctx||!this.buffer||ctx.state!=='running')return;try{this.source?.stop();const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffer;gain.gain.value=.6;source.connect(gain);gain.connect(ctx.destination);source.start();source.onended=()=>{source.disconnect();gain.disconnect();if(this.source===source)this.source=null};this.source=source}catch{}}
}
if(typeof module!=='undefined')module.exports=PageTurnSound;
