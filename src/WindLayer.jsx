import React,{useEffect,useRef} from 'react';
import {windVector} from './operation-geometry.js';
// Screen particles visualize a dated station vector, never a spread/runoff model.
export default function WindLayer({map,wind,enabled,mobile}){
 const canvas=useRef(null);
 useEffect(()=>{const m=map;if(!m||!enabled||!wind||wind.speedMps<=0)return;const c=canvas.current,ctx=c.getContext('2d');let frame,last=0,particles=[],dirty=true;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const resize=()=>{dirty=true;};const ro=new ResizeObserver(resize);ro.observe(c);
 const tick=t=>{frame=requestAnimationFrame(tick);if(document.hidden||reduced.matches||t-last<50)return;const dt=Math.min((t-last)/1000,.1);last=t;
  const rect=c.getBoundingClientRect();if(dirty){const ratio=Math.min(devicePixelRatio,2);c.width=Math.round(rect.width*ratio);c.height=Math.round(rect.height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);particles=Array.from({length:mobile?35:70},()=>({x:Math.random()*rect.width,y:Math.random()*rect.height,age:Math.random()*4}));dirty=false;}
  ctx.clearRect(0,0,rect.width,rect.height);const v=windVector(wind.fromDegrees),a=m.getBearing()*Math.PI/180,dx=v.east*Math.cos(a)-v.north*Math.sin(a),dy=-(v.east*Math.sin(a)+v.north*Math.cos(a)),speed=12+Math.min(wind.speedMps,30)*2;
  ctx.strokeStyle='rgba(174,231,246,.55)';ctx.lineWidth=1;
  for(const p of particles){p.x+=dx*speed*dt;p.y+=dy*speed*dt;p.age+=dt;if(p.age>4||p.x<0||p.x>rect.width||p.y<0||p.y>rect.height){p.x=Math.random()*rect.width;p.y=Math.random()*rect.height;p.age=0;}ctx.beginPath();ctx.moveTo(p.x-dx*9,p.y-dy*9);ctx.lineTo(p.x,p.y);ctx.stroke();}
 };frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);ro.disconnect();ctx.clearRect(0,0,c.width,c.height);};
 },[map,wind?.fromDegrees,wind?.speedMps,wind?.observedAt,enabled,mobile]);
 return <canvas ref={canvas} className="wind-canvas" aria-hidden="true"/>;
}
