const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Ratios for ideal spherical soap bubbles with equal surface tension.
// The reference radius is one model unit, not a measurement of breath or air.
export function sphereComparison(scale){
  if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Radius must be positive.');
  return {radius:scale,area:scale*scale,volume:scale**3,pressure:1/scale,
    surfaceArea:4*Math.PI*scale*scale,enclosedVolume:4/3*Math.PI*scale**3};
}
export function rotatePoint([x,y,z],yaw,pitch){
  const a=x*Math.cos(yaw)+z*Math.sin(yaw),b=z*Math.cos(yaw)-x*Math.sin(yaw);
  return [a,y*Math.cos(pitch)-b*Math.sin(pitch),y*Math.sin(pitch)+b*Math.cos(pitch)];
}
const meridians=Array.from({length:12},(_,j)=>Array.from({length:65},(_,i)=>{
  const a=i/64*Math.PI*2,l=j/12*Math.PI;return[Math.sin(a)*Math.cos(l),Math.cos(a),Math.sin(a)*Math.sin(l)];
}));
const parallels=Array.from({length:7},(_,j)=>Array.from({length:65},(_,i)=>{
  const lat=(j-3)*Math.PI/9,a=i/64*Math.PI*2;return[Math.cos(lat)*Math.cos(a),Math.sin(lat),Math.cos(lat)*Math.sin(a)];
}));

export class GeometryLens{
  constructor({onChange=()=>{}}={}){this.onChange=onChange;this.active=false;this.progress=0;this.scale=1;this.displayScale=1;this.yaw=.35;this.pitch=-.28;this.drag=null;this.armed=false;this.lastInput=0;this.source=null;}
  open(bubble){this.source={id:bubble.id,x:bubble.x,y:bubble.y,r:bubble.r,hue:bubble.note.h,frequency:bubble.note.f};this.scale=this.displayScale=1;this.yaw=.35;this.pitch=-.28;this.active=true;this.armed=false;this.drag=null;this.onChange(this.status());}
  close(){this.active=false;this.drag=null;this.onChange(this.status());}
  setScale(value){this.scale=Math.round(clamp(Number(value)||1,1,2)*100)/100;this.onChange(this.status());}
  input(point,now,{width,height,track}){
    if(!this.active)return;
    if(!point){this.drag=null;this.armed=false;return;}
    if(!point.closed){this.drag=null;this.armed=true;return;}
    if(!this.armed)return;
    if(!this.drag){this.drag={x:point.x,y:point.y,mode:track&&Math.abs(point.y-track.y)<30?'scale':'rotate'};}
    this.lastInput=now;
    if(this.drag.mode==='scale'&&track)this.setScale(1+(point.x-track.left)/(track.right-track.left));
    else{this.yaw+=(point.x-this.drag.x)/Math.max(200,width)*Math.PI*2;this.pitch=clamp(this.pitch+(point.y-this.drag.y)/Math.max(200,height)*Math.PI,-1.3,1.3);}
    this.drag.x=point.x;this.drag.y=point.y;
  }
  step(dt,now,reduceMotion){
    const target=this.active?1:0;
    this.progress=reduceMotion?target:this.progress+(target-this.progress)*(1-Math.exp(-dt*6));
    if(Math.abs(this.progress-target)<.002)this.progress=target;
    this.displayScale=reduceMotion?this.scale:this.displayScale+(this.scale-this.displayScale)*(1-Math.exp(-dt*11));
    if(this.active&&!this.drag&&!reduceMotion&&now-this.lastInput>1200)this.yaw+=dt*.1;
  }
  status(){return{active:this.active,selectedBubble:this.source?.id??null,scale:this.scale,ratios:sphereComparison(this.scale),yaw:this.yaw,pitch:this.pitch};}
  draw(g,width,height,now){
    const p=this.progress;if(!this.source||p<=0)return;
    const base=Math.min(width*.205,(height-190)/4,104),radius=base*this.displayScale;
    const cx=this.source.x+(width/2-this.source.x)*p,cy=this.source.y+((height-17)/2-this.source.y)*p;
    const r=this.source.r+(radius-this.source.r)*p;
    g.save();g.globalAlpha=p;
    // A ground plane and shadow give the surface a quiet spatial reference.
    const floor=Math.min(height-95,cy+radius+25);
    g.strokeStyle='#4c7a9120';g.lineWidth=.7;
    for(let j=-4;j<=4;j++){g.beginPath();g.moveTo(width*.08,floor+j*5);g.lineTo(width*.92,floor+j*5);g.stroke();}
    for(let j=-5;j<=5;j++){g.beginPath();g.moveTo(cx+j*width*.055,floor-20);g.lineTo(cx+j*width*.08,floor+20);g.stroke();}
    g.save();g.translate(cx,floor);g.scale(1,.14);const shadow=g.createRadialGradient(0,0,0,0,0,r*.88);shadow.addColorStop(0,'#6484a52b');shadow.addColorStop(1,'#6484a500');g.fillStyle=shadow;g.beginPath();g.arc(0,0,r*.88,0,Math.PI*2);g.fill();g.restore();
    g.translate(cx,cy);
    const film=g.createRadialGradient(-r*.32,-r*.38,r*.1,0,0,r);film.addColorStop(0,'#ffffffbb');film.addColorStop(.5,'#deeffa10');film.addColorStop(.83,'#b9e8ee1c');film.addColorStop(.97,'#c4a8e43a');film.addColorStop(1,'#b4dce55c');g.fillStyle=film;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
    const wire=(path,equator=false)=>{
      const pts=path.map(v=>rotatePoint(v,this.yaw,this.pitch));
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i],z=(a[2]+b[2])/2,front=z>0;
        g.strokeStyle=equator?(front?'#397e9bbd':'#397e9b28'):`rgba(62,108,128,${front?.22+.38*z:.065})`;
        g.lineWidth=equator?1.5:front?1:.65;g.beginPath();g.moveTo(a[0]*r,a[1]*r);g.lineTo(b[0]*r,b[1]*r);g.stroke();
      }
    };
    g.save();g.globalAlpha=p*p;for(const path of meridians)wire(path);parallels.forEach((path,i)=>wire(path,i===3));g.restore();
    for(let i=0;i<96;i++){const a=i/96*Math.PI*2;g.beginPath();g.arc(0,0,r,a,a+Math.PI/48+.008);g.lineWidth=2.2;g.strokeStyle=`hsla(${(this.source.hue+Math.sin(a*2+now*.00012)*120+360)%360},65%,59%,.7)`;g.stroke();}
    g.beginPath();g.ellipse(-r*.32,-r*.62,r*.28,r*.07,-.5,0,Math.PI*2);g.fillStyle='#ffffffb5';g.fill();
    if(this.displayScale>1.025){g.save();g.setLineDash([3,5]);g.strokeStyle='#9b87918c';g.lineWidth=1;g.beginPath();g.arc(0,0,base,0,Math.PI*2);g.stroke();g.restore();g.fillStyle='#786775';g.font='italic 13px Georgia';g.textAlign='center';g.fillText('original',0,base+16);}
    // Radius is an exact orthographic silhouette radius, independent of mesh rotation.
    g.strokeStyle='#326a85';g.fillStyle='#326a85';g.lineWidth=1;g.beginPath();g.moveTo(0,0);g.lineTo(r,0);g.moveTo(r,-5);g.lineTo(r,5);g.stroke();g.beginPath();g.arc(0,0,2.5,0,Math.PI*2);g.fill();
    g.font='italic 15px Georgia';g.textAlign='center';g.fillText('r = '+this.scale.toFixed(2)+'×',r*.53,-10);
    g.restore();
  }
}
