'use strict';
// Count elapsed listening time, independent of media seeks and playback speed.
class ListeningClock {
 constructor(save,now=()=>performance.now()){this.save=save;this.now=now;this.id=null;this.since=null}
 start(id){if(this.since!==null&&this.id===id)return;this.stop();this.id=id;this.since=this.now()}
 flush(){if(this.since===null)return;const now=this.now(),seconds=Math.max(0,(now-this.since)/1000);this.since=now;if(seconds>0)this.save(this.id,seconds)}
 stop(){this.flush();this.since=null;this.id=null}
}
if(typeof module!=='undefined')module.exports=ListeningClock;
