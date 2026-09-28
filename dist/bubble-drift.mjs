import{keepInside}from'./interaction.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function region(b,bounds){
  const inset=b.r*1.035+4;
  const left=bounds.left+inset,right=Math.max(left,bounds.right-inset);
  const top=bounds.top+inset,bottom=Math.max(top,bounds.bottom-inset);
  return {left,right,top,bottom};
}
function destination(b,bounds){
  const area=region(b,bounds),d=b.drift;
  return {x:area.left+(area.right-area.left)*d.u,y:area.top+(area.bottom-area.top)*d.v};
}
function anchor(b,bounds,x,y){
  const area=region(b,bounds);
  b.drift.u=clamp((x-area.left)/Math.max(1,area.right-area.left),0,1);
  b.drift.v=clamp((y-area.top)/Math.max(1,area.bottom-area.top),0,1);
}
export function prepareDrift(b,others,bounds,reduced=false,random=Math.random){
  const area=region(b,bounds);let best=null,bestGap=-Infinity;
  // Choose among random empty places; reserve destinations as well as checking
  // current positions, so consecutive breaths don't all fly to the same corner.
  for(let i=0;i<32;i++){
    const u=random(),v=random(),x=area.left+(area.right-area.left)*u,y=area.top+(area.bottom-area.top)*v;
    let gap=Infinity;
    for(const other of others){
      if(other===b)continue;
      const target=other.drift?destination(other,bounds):other;
      const spacing=b.r+other.r+12;
      gap=Math.min(gap,Math.hypot(x-target.x,y-target.y)/spacing,Math.hypot(x-other.x,y-other.y)/spacing);
    }
    if(gap>bestGap){bestGap=gap;best={u,v};}
  }
  b.drift={...best,lastX:b.x,lastY:b.y,clock:0};
  if(reduced){const target=destination(b,bounds);b.x=target.x;b.y=target.y;b.vx=b.vy=0;keepInside(b,bounds);b.drift.lastX=b.x;b.drift.lastY=b.y;}
}
export function resizeDrift(b){
  // Resizing clamps positions through the existing page bounds. Keep the
  // normalized destination instead of mistaking that clamp for a user drag.
  if(b.drift){b.drift.lastX=b.x;b.drift.lastY=b.y;}
}
export function advanceDrift(b,others,bounds,dt,reduced=false){
  if(!b.drift)prepareDrift(b,others,bounds,reduced);
  const d=b.drift;
  // A pointer, hand, keyboard or page resize may have placed it elsewhere.
  // Continue floating from that place instead of tugging it back after release.
  if(Math.hypot(b.x-d.lastX,b.y-d.lastY)>.5){anchor(b,bounds,b.x,b.y);d.clock=0;}
  if(reduced){b.vx=b.vy=0;d.lastX=b.x;d.lastY=b.y;return;}
  d.clock+=dt;const target=destination(b,bounds),t=d.clock,seed=b.seed;
  target.x+=Math.sin(t*.23+seed)*12+Math.sin(t*.11+seed*2)*6;
  target.y+=Math.cos(t*.19+seed*1.4)*10+Math.sin(t*.13+seed)*5;
  let vx=(target.x-b.x)*.3,vy=(target.y-b.y)*.3;
  for(const other of others){
    if(other===b)continue;
    const dx=b.x-other.x,dy=b.y-other.y,distance=Math.hypot(dx,dy),space=b.r+other.r+10;
    if(distance<space){
      const angle=b.id>other.id?b.seed+other.seed:b.seed+other.seed+Math.PI;
      const nx=distance>.1?dx/distance:Math.cos(angle),ny=distance>.1?dy/distance:Math.sin(angle);
      const push=(1-distance/space)*16;vx+=nx*push;vy+=ny*push;
    }
  }
  const speed=Math.hypot(vx,vy),limit=32;
  if(speed>limit){vx*=limit/speed;vy*=limit/speed;}
  const ease=1-Math.exp(-dt*1.4);
  b.vx+=(vx-b.vx)*ease;b.vy+=(vy-b.vy)*ease;b.x+=b.vx*dt;b.y+=b.vy*dt;
  keepInside(b,bounds);d.lastX=b.x;d.lastY=b.y;
}
