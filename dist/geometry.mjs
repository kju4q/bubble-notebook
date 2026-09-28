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
// Camera looks down -z. Points nearer the camera project larger.
export function projectPoint([x,y,z],distance=6){
  return [x/(distance-z),y/(distance-z),z];
}
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};

// A reusable, masked color layer keeps the film airy at the center and rich at
// grazing angles. This is an artistic soap-film treatment, not a fluid solver.
function paintFilm(g,r,sourceHue,phase,yaw,pitch,rim){
  const circle=()=>{g.beginPath();g.arc(0,0,r,0,Math.PI*2);};
  g.save();circle();g.clip();
  const body=g.createRadialGradient(-r*.22,-r*.3,r*.08,0,0,r);
  body.addColorStop(0,'#ffffff35');body.addColorStop(.48,'#e6f6fb08');
  body.addColorStop(.76,'#a3cfde0b');body.addColorStop(.9,'#86a9bd15');
  body.addColorStop(.978,'#42667b38');body.addColorStop(1,'#d9faff05');
  g.fillStyle=body;circle();g.fill();

  const wash=(x,y,size,color)=>{
    const gradient=g.createRadialGradient(x*r,y*r,0,x*r,y*r,size*r);
    gradient.addColorStop(0,color);gradient.addColorStop(1,'#ffffff00');
    g.fillStyle=gradient;g.fillRect(-r,-r,r*2,r*2);
  };
  wash(-.54,-.55,.58,'#d1faff57');
  wash(.65,-.17,.48,'#e6b1e54a');
  wash(-.32,.79,.48,'#8ce2e64d');
  wash(.25,.72,.44,'#ffdb9940');
  wash(.14,.24,.68,'#ffffff28');

  const c=rim.getContext('2d'),size=rim.width,mid=size/2,edge=mid-3;
  c.clearRect(0,0,size,size);
  const rainbow=c.createConicGradient(phase+yaw*.12+sourceHue*Math.PI/180,mid,mid);
  const colors=['#d981ce','#a489dd','#72c6e2','#8de0cb','#e6d27e','#efa2b0','#d981ce'];
  colors.forEach((color,i)=>rainbow.addColorStop(i/(colors.length-1),color));
  c.fillStyle=rainbow;c.fillRect(0,0,size,size);
  c.globalCompositeOperation='destination-in';
  const mask=c.createRadialGradient(mid,mid,0,mid,mid,edge);
  mask.addColorStop(0,'#0000');mask.addColorStop(.73,'#0000');
  mask.addColorStop(.84,'#00000012');mask.addColorStop(.91,'#00000036');
  mask.addColorStop(.954,'#00000094');mask.addColorStop(.977,'#000000dc');
  mask.addColorStop(.992,'#00000070');mask.addColorStop(1,'#0000');
  c.fillStyle=mask;c.fillRect(0,0,size,size);c.globalCompositeOperation='source-over';
  g.drawImage(rim,-r*mid/edge,-r*mid/edge,r*size/edge,r*size/edge);

  // Broad reflected light and finer curved glints sit at different depths.
  g.save();g.rotate(-.38+Math.sin(yaw)*.045);
  const light=g.createRadialGradient(-r*.24,-r*.6,0,-r*.24,-r*.6,r*.52);
  light.addColorStop(0,'#ffffffe0');light.addColorStop(.32,'#ffffff70');light.addColorStop(1,'#ffffff00');
  g.fillStyle=light;g.scale(1,.48);g.fillRect(-r*2,-r*3,r*4,r*6);g.restore();
  const glint=(start,end,inset,width,color,blur=0)=>{
    g.save();g.filter=blur?`blur(${blur}px)`:'none';g.lineCap='round';
    g.beginPath();g.arc(0,0,r*inset,start,end);g.lineWidth=width;g.strokeStyle=color;g.stroke();g.restore();
  };
  const shift=Math.sin(yaw)*.07+pitch*.025;
  glint(3.65+shift,4.64+shift,.88,r*.055,'#ffffff85',r*.025);
  glint(3.75+shift,4.38+shift,.921,r*.019,'#ffffffe0',r*.005);
  glint(4.48+shift,4.7+shift,.94,r*.012,'#ffffffc2',r*.004);
  glint(.44,1.34,.957,r*.026,'#fff4db7a',r*.012);
  glint(.72,1.2,.98,Math.max(.7,r*.006),'#ffffffb0');
  // A curved window reflection, with soft edges and a brighter inner glint.
  g.save();g.rotate(shift);
  const reflection=g.createLinearGradient(-r*.8,-r*.8,-r*.2,-r*.36);
  reflection.addColorStop(0,'#ffffff00');reflection.addColorStop(.38,'#fffffff2');
  reflection.addColorStop(.7,'#ffffff72');reflection.addColorStop(1,'#ffffff00');
  g.fillStyle=reflection;g.filter=`blur(${r*.018}px)`;
  g.beginPath();g.moveTo(-r*.81,-r*.26);
  g.bezierCurveTo(-r*.78,-r*.62,-r*.51,-r*.83,-r*.22,-r*.79);
  g.bezierCurveTo(-r*.42,-r*.71,-r*.64,-r*.53,-r*.7,-r*.22);
  g.closePath();g.fill();g.restore();
  // Slow, broad interference bands near the lower rim avoid a uniform outline.
  g.save();g.translate(0,r*.05);g.rotate(Math.sin(phase)*.1);
  for(let i=0;i<3;i++){
    g.beginPath();g.ellipse(0,0,r*(.91-i*.033),r*(.91-i*.047),0,.28,2.67);
    g.lineWidth=r*(.013+i*.004);g.strokeStyle=`hsla(${185+i*72+Math.sin(phase)*25},70%,77%,${.23-i*.045})`;
    g.filter=`blur(${r*.009}px)`;g.stroke();
  }
  g.restore();g.restore();
}
const circlePath=fn=>Array.from({length:129},(_,i)=>fn(i/128*Math.PI*2));
const meridians=Array.from({length:4},(_,j)=>circlePath(a=>{
  const longitude=j/4*Math.PI;return[Math.sin(a)*Math.cos(longitude),Math.cos(a),Math.sin(a)*Math.sin(longitude)];
}));
const parallels=[-Math.PI/5,0,Math.PI/5].map(lat=>circlePath(a=>[Math.cos(lat)*Math.cos(a),Math.sin(lat),Math.cos(lat)*Math.sin(a)]));
const orbits=[.82,-.95].map(tilt=>circlePath(a=>rotatePoint([Math.cos(a)*1.1,Math.sin(a)*1.1,0],.45,tilt)));

export class GeometryLens{
  constructor({onChange=()=>{}}={}){this.onChange=onChange;this.active=false;this.progress=0;this.scale=1;this.displayScale=1;this.yaw=.35;this.pitch=-.28;this.drag=null;this.armed=false;this.lastInput=0;this.source=null;}
  open(bubble){this.source={id:bubble.id,x:bubble.x,y:bubble.y,r:bubble.r,hue:bubble.note.h,frequency:bubble.note.f};this.scale=this.displayScale=1.5;this.yaw=.35;this.pitch=-.28;this.revealAge=0;this.active=true;this.armed=false;this.drag=null;this.onChange(this.status());}
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
    this.reduceMotion=reduceMotion;if(this.active)this.revealAge+=dt;
    const target=this.active?1:0;
    this.progress=reduceMotion?target:this.progress+(target-this.progress)*(1-Math.exp(-dt*6));
    if(Math.abs(this.progress-target)<.002)this.progress=target;
    this.displayScale=reduceMotion?this.scale:this.displayScale+(this.scale-this.displayScale)*(1-Math.exp(-dt*11));
    if(this.active&&!this.drag&&!reduceMotion&&now-this.lastInput>1200)this.yaw+=dt*.1;
  }
  status(){return{active:this.active,selectedBubble:this.source?.id??null,scale:this.scale,ratios:sphereComparison(this.scale),yaw:this.yaw,pitch:this.pitch};}
  draw(g,width,height,now){
    const p=this.progress;if(!this.source||p<=0)return;
    // Keep a fixed camera: the 1× construction does not grow with the new sphere.
    const distance=6,scale=this.displayScale,stageHeight=height-138,annotationRoom=width<620?44:0;
    const maxRadius=Math.max(1,Math.min((width-58)/2.4,(stageHeight-66-annotationRoom)/2.1));
    const focal=maxRadius*Math.sqrt(distance*distance-4)/2;
    const base=focal/Math.sqrt(distance*distance-1);
    const radius=focal*scale/Math.sqrt(distance*distance-scale*scale);
    const cx=this.source.x+(width/2-this.source.x)*p,cy=this.source.y+((stageHeight+36-annotationRoom)/2-this.source.y)*p;
    const r=this.source.r+(radius-this.source.r)*p,projection=focal*r/radius;
    const reveal=this.reduceMotion?1:smooth((this.revealAge-.55)/.85);
    const ink='#365537',lightInk='#76816a';
    g.save();g.globalAlpha=p;g.translate(cx,cy);
    if(!this.rim){this.rim=g.canvas.ownerDocument.createElement('canvas');this.rim.width=this.rim.height=512;}
    g.save();g.globalAlpha=p*.38;
    paintFilm(g,r,this.source.hue,this.reduceMotion?0:now*.00016,this.yaw,this.pitch,this.rim);
    g.restore();g.globalAlpha=p*reveal;

    // Stroke continuous paths so dashed hidden curves read as construction ink,
    // rather than restarting a dash at each small segment of the sphere.
    const curve=(path,size,frontPass,{orbit=false,reference=false,equator=false}={})=>{
      const points=path.map(v=>rotatePoint(v,this.yaw,this.pitch).map(n=>n*size));
      g.save();g.strokeStyle=reference?'#77806b85':frontPass?(equator?'#365537bd':'#36553799'):'#61765b64';
      g.lineWidth=reference?.8:orbit?.85:equator?1.05:.85;
      g.setLineDash(reference?[4,5]:frontPass?[]:[2,4]);g.lineCap='round';g.beginPath();let connected=false;
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],front=(a[2]+b[2])/2>(orbit?0:size*size/distance);
        if(!reference&&front!==frontPass){connected=false;continue;}
        const pa=projectPoint(a,distance),pb=projectPoint(b,distance);
        if(!connected)g.moveTo(pa[0]*projection,pa[1]*projection);
        g.lineTo(pb[0]*projection,pb[1]*projection);connected=true;
      }
      g.stroke();g.restore();
    };
    for(const front of [false,true]){
      for(const path of meridians)curve(path,scale,front);
      parallels.forEach((path,i)=>curve(path,scale,front,{equator:i===1}));
      for(const path of orbits)curve(path,scale,front,{orbit:true});
    }
    g.strokeStyle='#365537a6';g.lineWidth=1;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.stroke();

    if(this.displayScale>1.025){
      g.save();g.setLineDash([4,5]);g.strokeStyle='#7b82618c';g.lineWidth=.85;
      g.beginPath();g.arc(0,0,base*r/radius,0,Math.PI*2);g.stroke();g.restore();
      curve(parallels[1],1,false,{reference:true});
      g.fillStyle=lightInk;g.font='italic 12px Georgia';g.textAlign='center';g.fillText('r₀ · original',0,base*r/radius+15);
    }
    // An actual center-to-surface radius, with a fine arrowhead like a compass plate.
    const a=-.3,end=projectPoint([scale*Math.cos(a),scale*Math.sin(a),0],distance);
    const ex=end[0]*projection,ey=end[1]*projection;
    g.strokeStyle=ink;g.fillStyle=ink;g.lineWidth=.9;g.beginPath();g.moveTo(0,0);g.lineTo(ex,ey);
    for(const side of [-1,1]){g.moveTo(ex,ey);g.lineTo(ex-6*Math.cos(a)+side*3*Math.sin(a),ey-6*Math.sin(a)-side*3*Math.cos(a));}
    g.stroke();g.beginPath();g.arc(0,0,2.2,0,Math.PI*2);g.fill();
    g.font='italic 14px Georgia';g.textAlign='center';g.fillText('r = '+this.scale.toFixed(2)+'r₀',ex*.55,ey*.55-11);

    const ratios=sphereComparison(this.scale);
    const notes=[['A = 4πr²','surface · '+ratios.area.toFixed(2)+'×'],['V = ⁴⁄₃πr³','volume · '+ratios.volume.toFixed(2)+'×'],['ΔP = 4γ/r','pressure · '+ratios.pressure.toFixed(2)+'×']];
    if(width>=620){
      const margin=28,edge=width/2-margin;
      const places=[[-edge,-r*.54,-r*.81,-r*.42,'left'],[edge,-r*.54,r*.81,-r*.42,'right'],[-edge,r*.62,-r*.75,r*.62,'left']];
      notes.forEach(([formula,value],i)=>{
        const [x,y,ax,ay,align]=places[i],direction=align==='left'?1:-1;
        g.strokeStyle='#697b5873';g.lineWidth=.7;g.beginPath();g.moveTo(ax,ay);g.lineTo(x+direction*106,y+8);g.lineTo(x,y+8);g.stroke();
        g.fillStyle=ink;g.textAlign=align;g.font='italic 15px Georgia';g.fillText(formula,x,y);
        g.fillStyle=lightInk;g.font='12px Georgia';g.fillText(value,x,y+26);
      });
    }else{
      const y=stageHeight-cy-37;
      notes.forEach(([formula,value],i)=>{
        const x=(i-1)*width*.31;g.textAlign='center';g.fillStyle=ink;g.font='italic 13px Georgia';g.fillText(formula,x,y);
        g.fillStyle=lightInk;g.font='11px Georgia';g.fillText(value,x,y+19);
      });
    }
    g.restore();
  }
}
