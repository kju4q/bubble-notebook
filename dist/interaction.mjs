const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function keepInside(b,bounds){
  const minX=bounds.left+b.r,maxX=bounds.right-b.r,minY=bounds.top+b.r,maxY=bounds.bottom-b.r;
  if(minX>maxX)b.x=(bounds.left+bounds.right)/2;
  else if(b.x<minX){b.x=minX;b.vx=Math.abs(b.vx||0)*.65;}else if(b.x>maxX){b.x=maxX;b.vx=-Math.abs(b.vx||0)*.65;}
  if(minY>maxY)b.y=(bounds.top+bounds.bottom)/2;
  else if(b.y<minY){b.y=minY;b.vy=Math.abs(b.vy||0)*.65;}else if(b.y>maxY){b.y=maxY;b.vy=-Math.abs(b.vy||0)*.65;}
}

export function handPoint(landmarks,wasClosed=false){
  if(!landmarks||landmarks.length<21)return null;
  if(![0,4,8,9].every(i=>Number.isFinite(landmarks[i]?.x)&&Number.isFinite(landmarks[i]?.y)))return null;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const palm=Math.max(.03,distance(landmarks[0],landmarks[9]));
  const ratio=distance(landmarks[4],landmarks[8])/palm;
  return{x:clamp(1-landmarks[8].x,0,1),y:clamp(landmarks[8].y,0,1),closed:ratio<(wasClosed?.58:.38),ratio};
}

// Both fingertip input and pointer input use this same interaction state machine.
export class BubbleInteraction{
  constructor({pick,onGrab=()=>{},onMove=()=>{},onRelease=()=>{},onPop=()=>{}}){Object.assign(this,{pick,onGrab,onMove,onRelease,onPop});this.held=null;this.hover=null;this.closed=false;this.armed=false;this.lastTap=null;this.downAt=0;this.maxTravel=0;this.origin=null;}
  expire(now){if(this.lastTap&&now-this.lastTap.time>650)this.lastTap=null;}
  update(point,now){
    if(!point){this.cancel();return;}
    if(!point.closed)this.armed=true;
    this.hover=this.held??this.pick(point.x,point.y);
    if(point.closed&&!this.closed&&this.armed){
      this.held=this.pick(point.x,point.y);this.origin={x:point.x,y:point.y};this.downAt=now;this.maxTravel=0;
      if(this.held){this.offset={x:this.held.x-point.x,y:this.held.y-point.y};this.onGrab(this.held);}
    }
    if(point.closed&&this.held){
      this.maxTravel=Math.max(this.maxTravel,Math.hypot(point.x-this.origin.x,point.y-this.origin.y));
      this.onMove(this.held,point.x+this.offset.x,point.y+this.offset.y);
    }
    if(!point.closed&&this.closed&&this.held){
      const b=this.held,tap=now-this.downAt<=300&&this.maxTravel<18;
      this.held=null;this.onRelease(b);
      if(tap&&this.lastTap?.bubble===b&&now-this.lastTap.time<650){this.lastTap=null;this.hover=null;this.onPop(b);}
      else this.lastTap=tap?{bubble:b,time:now}:null;
    }
    this.expire(now);
    this.closed=point.closed;
  }
  cancel(){if(this.held)this.onRelease(this.held);this.held=null;this.hover=null;this.closed=false;this.armed=false;this.lastTap=null;}
}
