'use strict';
function adventureIsDay(date){const hour=date.getHours();return hour>=7&&hour<19}
function adventureWarp(x,y,region,time){const [left,top,right,bottom,amount,phase]=region;const nx=(x-left)/(right-left),ny=(y-top)/(bottom-top);const weight=Math.sin(Math.PI*nx)*Math.sin(Math.PI*ny);const wave=Math.sin(time*1.8+nx*3.4+phase);return [x+weight*amount*.18*Math.cos(time*1.8+phase),y+weight*amount*wave]}
if(typeof module!=='undefined')module.exports={adventureIsDay,adventureWarp};
if(typeof document!=='undefined'){
 const section=document.querySelector('.intro'),image=document.querySelector('.adventureBackdrop'),canvas=document.createElement('canvas');canvas.className='adventureBackdrop adventureMotion';canvas.setAttribute('aria-hidden','true');section.append(canvas);const ctx=canvas.getContext('2d');const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let day=null,ready=false,visible=true,last=0;
 function theme(){const value=adventureIsDay(new Date());if(value===day)return;day=value;ready=false;canvas.hidden=true;image.style.visibility='';section.classList.toggle('dayAdventure',day);image.src=day?'assets/prince-adventure-day-v1.webp':'assets/prince-adventure-v1.webp'}
 image.addEventListener('load',()=>{canvas.width=Math.min(1280,image.naturalWidth);canvas.height=Math.round(canvas.width*image.naturalHeight/image.naturalWidth);ready=true;if(reduced.matches||!ctx){canvas.hidden=true;image.style.visibility=''}else{paint(0);canvas.hidden=false;image.style.visibility='hidden'}});
 image.addEventListener('error',()=>{ready=false;canvas.hidden=true;image.style.visibility=''});
 function triangle(s,t){const sx=s[1][0]-s[0][0],sy=s[1][1]-s[0][1],ux=s[2][0]-s[0][0],uy=s[2][1]-s[0][1],det=sx*uy-ux*sy;const dx=t[1][0]-t[0][0],dy=t[1][1]-t[0][1],vx=t[2][0]-t[0][0],vy=t[2][1]-t[0][1];const a=(dx*uy-vx*sy)/det,b=(dy*uy-vy*sy)/det,c=(vx*sx-dx*ux)/det,d=(vy*sx-dy*ux)/det;ctx.save();ctx.beginPath();ctx.moveTo(...t[0]);ctx.lineTo(...t[1]);ctx.lineTo(...t[2]);ctx.closePath();ctx.clip();ctx.setTransform(a,b,c,d,t[0][0]-a*s[0][0]-c*s[0][1],t[0][1]-b*s[0][0]-d*s[0][1]);ctx.drawImage(image,0,0,canvas.width,canvas.height);ctx.restore()}
 function patch(region,time){const cols=16,rows=6;const p=(i,j)=>[region[0]+(region[2]-region[0])*i/cols,region[1]+(region[3]-region[1])*j/rows];for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const s=[p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)],t=s.map(([x,y])=>adventureWarp(x,y,region,time));triangle([s[0],s[1],s[2]],[t[0],t[1],t[2]]);triangle([s[0],s[2],s[3]],[t[0],t[2],t[3]])}}
 function paint(time){if(!ctx)return;const w=canvas.width,h=canvas.height;ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(image,0,0,w,h);patch([.57*w,.37*h,.71*w,.59*h,3.8,0],time);patch([.555*w,.70*h,.635*w,.95*h,3.2,1.8],time)}
 function animate(ms){if(ready&&visible&&!reduced.matches&&!document.hidden&&document.getElementById('reader').hidden&&ms-last>=65){last=ms;paint(ms/1000)}requestAnimationFrame(animate)}
 reduced.addEventListener('change',()=>{canvas.hidden=reduced.matches||!ready;image.style.visibility=reduced.matches?'':'hidden'});
 if(typeof IntersectionObserver!=='undefined')new IntersectionObserver(items=>{visible=items[0].isIntersecting}).observe(section);
 theme();setInterval(theme,60000);document.addEventListener('visibilitychange',theme);requestAnimationFrame(animate);
}
