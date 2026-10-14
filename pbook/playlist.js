'use strict';
class BookQueue {
 constructor(ids=[],mode='order',random=Math.random){this.ids=[...new Set(ids)];this.mode=['order','loop','repeat','shuffle'].includes(mode)?mode:'order';this.random=random;this.bag=[];this.active=false}
 set(ids,mode=this.mode){this.ids=[...new Set(ids)];this.mode=['order','loop','repeat','shuffle'].includes(mode)?mode:'order';this.bag=[]}
 next(current){if(!this.ids.length)return null;if(this.mode==='repeat')return this.ids.includes(current)?current:this.ids[0];if(this.mode==='order'||this.mode==='loop'){const i=this.ids.indexOf(current);return this.ids[i+1]??(this.mode==='loop'?this.ids[0]:null)}this.bag=this.bag.filter(id=>this.ids.includes(id)&&id!==current);if(!this.bag.length)this.bag=this.ids.filter(id=>id!==current);if(!this.bag.length)return this.ids[0];return this.bag.splice(Math.floor(this.random()*this.bag.length),1)[0]}
}
if(typeof module!=='undefined')module.exports=BookQueue;
