const TAU=Math.PI*2,SEGMENTS=96;
const outlines=new WeakMap();

// A few unequal surface waves flex the film without turning the sphere into an oval.
export function filmRadius(angle,seed,seconds){
  return 1+(.009+.003*Math.sin(seconds*.57+seed))*Math.sin(2*angle+seed*.7)
    +(.012+.004*Math.sin(seconds*.43+seed*1.3))*Math.cos(3*angle-seed+Math.sin(seconds*.31)*.45)
    +.004*Math.sin(5*angle+seed*2+seconds*.38);
}
export function lensPoint(x,y,r,seed,seconds){
  // Identity at the edge, about 11% magnification at the centre. Smooth falloff
  // bends a ruled line rather than drawing a second, straight copy over it.
  const envelope=Math.max(0,1-(x*x+y*y)/(r*r))**2;
  const magnification=1+(.11+.008*Math.sin(seconds*.23+seed))*envelope;
  return [x*magnification+r*.006*envelope*Math.sin(y/r*2+seed+seconds*.19),
    y*magnification+r*.005*envelope*Math.cos(x/r*2-seed+seconds*.17)];
}
function outline(b,now,reduced){
  const seconds=reduced?0:now/1000;
  let cached=outlines.get(b);
  if(!cached){cached={points:new Float32Array((SEGMENTS+1)*2)};outlines.set(b,cached);}
  if(cached.seconds!==seconds||cached.radius!==b.r){
    for(let i=0;i<=SEGMENTS;i++){
      const a=i/SEGMENTS*TAU,r=b.r*filmRadius(a,b.seed,seconds);
      cached.points[i*2]=Math.cos(a)*r;cached.points[i*2+1]=Math.sin(a)*r;
    }
    cached.seconds=seconds;cached.radius=b.r;
  }
  return cached.points;
}
function trace(g,points){
  g.beginPath();g.moveTo(points[0],points[1]);
  for(let i=2;i<points.length;i+=2)g.lineTo(points[i],points[i+1]);
  g.closePath();
}
export function drawBubbleLens(g,b,now,reduced=false){
  const points=outline(b,now,reduced),seconds=reduced?0:now/1000,extent=b.r*1.04;
  g.save();g.translate(b.x,b.y);trace(g,points);g.clip();
  // Reconstruct the notebook's 24px ruling below the transparent film. This
  // avoids pixel readbacks or filters on every frame, including with the mic on.
  g.fillStyle='#fff9e5';g.fillRect(-extent,-extent,extent*2,extent*2);
  g.beginPath();
  for(const horizontal of [true,false]){
    const centre=horizontal?b.y:b.x;
    for(let line=Math.ceil((centre-extent)/24)*24+.5;line<=centre+extent;line+=24){
      const across=line-centre,steps=Math.ceil(extent*2/6);
      for(let i=0;i<=steps;i++){
        const along=-extent+i/steps*extent*2;
        const [x,y]=lensPoint(horizontal?along:across,horizontal?across:along,b.r,b.seed,seconds);
        if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
      }
    }
  }
  g.strokeStyle='#78a5bd22';g.lineWidth=1;g.stroke();g.restore();
}
export function drawBubbleFilm(g,b,now,reduced=false,selection=null){
  const r=b.r,points=outline(b,now,reduced),seconds=reduced?0:now/1000;
  g.save();g.translate(b.x,b.y);
  const fill=g.createRadialGradient(-r*.25,-r*.28,r*.12,0,0,r);
  fill.addColorStop(0,'rgba(255,255,255,.22)');fill.addColorStop(.72,'rgba(240,246,247,.015)');
  fill.addColorStop(.94,`hsla(${b.note.h},65%,75%,.11)`);fill.addColorStop(1,'rgba(141,177,187,.13)');
  g.fillStyle=fill;trace(g,points);g.fill();
  const phase=seconds*.16+b.seed;
  const rim=g.createConicGradient(0,0,0);
  for(let i=0;i<=48;i++){
    const a=i/48*TAU,hue=(b.note.h+Math.sin(a*2+phase)*95+360)%360;
    rim.addColorStop(i/48,`hsla(${hue},68%,${58+Math.sin(a+phase)*12}%,${.24+.32*(.5+.5*Math.sin(a*3+phase))})`);
  }
  // One continuous stroke avoids bright beads where translucent segments meet.
  g.lineCap='round';g.lineJoin='round';g.lineWidth=1.7+r*.011;g.strokeStyle=rim;trace(g,points);g.stroke();
  const highlight=(from,to,scale,color,width)=>{
    g.beginPath();
    for(let i=0;i<=24;i++){
      const a=from+(to-from)*i/24,d=r*scale*filmRadius(a,b.seed,seconds),x=Math.cos(a)*d,y=Math.sin(a)*d;
      if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
    }
    g.strokeStyle=color;g.lineWidth=width;g.stroke();
  };
  highlight(3.65,4.85,.94,'rgba(255,255,255,.94)',2);
  highlight(.45,1.32,.88,`hsla(${b.note.h+70},65%,68%,.22)`,1.6);
  if(selection){g.beginPath();g.arc(0,0,r+7,0,TAU);g.setLineDash([3,5]);g.strokeStyle=selection;g.lineWidth=1;g.stroke();g.setLineDash([]);}
  g.fillStyle='rgba(64,89,96,.7)';g.font='italic 14px Georgia';g.textAlign='center';g.textBaseline='middle';g.fillText(b.note.name,0,0);g.restore();
}
