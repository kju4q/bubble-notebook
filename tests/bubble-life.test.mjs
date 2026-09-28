import test from 'node:test';
import assert from 'node:assert/strict';
import {filmRadius,lensPoint} from '../dist/bubble-film.mjs';
import {prepareDrift,advanceDrift,resizeDrift} from '../dist/bubble-drift.mjs';
import {keepInside} from '../dist/interaction.mjs';
const random=()=>{let seed=8257;return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};};
const bubble=(id,r=44)=>({id,r,x:500,y:260,vx:0,vy:-14,seed:id*1.73,note:{name:'A4'},volume:r**3});
const desktop={left:50,right:1026,top:50,bottom:355};

test('film stays near-round, smooth and asymmetric while flexing independently',()=>{
  let change=0,asymmetry=0;
  for(const seed of [0,1.5,4,9.3])for(let t=0;t<30;t+=3)for(let i=0;i<96;i++){
    const a=i/96*Math.PI*2,r=filmRadius(a,seed,t);
    assert.ok(r>=.968&&r<=1.032,'all lobes fit the existing grab target');
    assert.ok(Math.abs(r-filmRadius(a,seed,t+.016))<.0002,'no sudden contour jumps');
    change=Math.max(change,Math.abs(r-filmRadius(a,seed,t+5)));
    asymmetry=Math.max(asymmetry,Math.abs(r-filmRadius(a+Math.PI,seed,t)));
  }
  assert.ok(change>.01);assert.ok(asymmetry>.02,'opposite sides are not an ellipse');
});
test('notebook lens magnifies and bends inner lines, joining the original ruling at the rim',()=>{
  for(const seed of [0,2,9])for(const time of [0,10,80]){
    const centre=lensPoint(0,0,60,seed,time),near=lensPoint(1,0,60,seed,time);
    assert.ok(near[0]-centre[0]>1.09&&near[0]-centre[0]<1.13);
    const middle=lensPoint(18,0,60,seed,time),end=lensPoint(18,55,60,seed,time);
    assert.ok(middle[0]-end[0]>1,'a vertical ruled line curves through the film');
    for(let i=0;i<96;i++){
      const a=i/96*Math.PI*2,x=60*Math.cos(a),y=60*Math.sin(a),p=lensPoint(x,y,60,seed,time);
      assert.ok(Math.hypot(p[0]-x,p[1]-y)<1e-10,'the grid meets at the edge without a double image');
    }
  }
});
test('consecutive releases spread across wide and narrow pages with gentle bounded speeds',()=>{
  for(const width of [320,520,1038]){
    const bounds={...desktop,right:width-12,bottom:width<=650?325:355},all=[],rng=random();
    for(let id=1;id<=12;id++){
      const b=bubble(id,28+id%4*6);b.x=width/2;b.y=bounds.bottom-b.r;prepareDrift(b,all,bounds,false,rng);all.push(b);
      for(let frame=0;frame<120;frame++)for(const item of all)advanceDrift(item,all,bounds,1/60);
    }
    for(let frame=0;frame<1200;frame++)for(const b of all){
      advanceDrift(b,all,bounds,1/60);
      assert.ok(Math.hypot(b.vx,b.vy)<=32.001);
      assert.ok(b.x>=bounds.left+b.r&&b.x<=bounds.right-b.r);
      assert.ok(b.y>=bounds.top+b.r&&b.y<=bounds.bottom-b.r);
      assert.equal(b.volume,b.r**3);assert.equal(b.note.name,'A4');
    }
    const xs=all.map(b=>b.x),ys=all.map(b=>b.y);
    assert.ok(Math.max(...xs)-Math.min(...xs)>(bounds.right-bounds.left-88)*.8,`page width ${width}: bubbles reach both sides`);
    assert.ok(Math.max(...ys)-Math.min(...ys)>(bounds.bottom-bounds.top-88)*.8,'bubbles reach different heights');
    const before=all.map(b=>({x:b.x,y:b.y}));
    for(let frame=0;frame<600;frame++)for(const b of all)advanceDrift(b,all,bounds,1/60);
    assert.ok(all.filter((b,i)=>Math.hypot(b.x-before[i].x,b.y-before[i].y)>3).length>=9,'independent drift continues after settling');
  }
});
test('dragged bubbles drift from their new position without returning to the release destination',()=>{
  const b=bubble(1),rng=random();prepareDrift(b,[],desktop,false,rng);
  for(let i=0;i<1200;i++)advanceDrift(b,[b],desktop,1/60);
  b.x=150;b.y=130;b.vx=b.vy=0;
  for(let i=0;i<900;i++)advanceDrift(b,[b],desktop,1/60);
  assert.ok(Math.hypot(b.x-150,b.y-130)<30);
});
test('reduced motion places bubbles separately and stops all autonomous movement',()=>{
  const all=[],rng=random();
  for(let id=1;id<=8;id++){const b=bubble(id);prepareDrift(b,all,desktop,true,rng);all.push(b);}
  const positions=all.map(b=>[b.x,b.y]);
  for(let i=0;i<100;i++)for(const b of all)advanceDrift(b,all,desktop,.016,true);
  assert.deepEqual(all.map(b=>[b.x,b.y]),positions);
  assert.ok(Math.max(...all.map(b=>b.x))-Math.min(...all.map(b=>b.x))>600);
});

test('narrowing the page retains spread instead of anchoring clamped bubbles at the right edge',()=>{
  const all=[],rng=random(),narrow={...desktop,right:338,bottom:325};
  for(let id=1;id<=12;id++){const b=bubble(id,32);prepareDrift(b,all,desktop,false,rng);all.push(b);}
  for(let i=0;i<1500;i++)for(const b of all)advanceDrift(b,all,desktop,1/60);
  const destinations=all.map(b=>[b.drift.u,b.drift.v]);
  for(const b of all){keepInside(b,narrow);resizeDrift(b);}
  for(let i=0;i<1500;i++)for(const b of all)advanceDrift(b,all,narrow,1/60);
  assert.deepEqual(all.map(b=>[b.drift.u,b.drift.v]),destinations);
  assert.ok(all.filter(b=>b.x<(narrow.left+narrow.right)/2).length>=4,'bubbles return to the left half as well');
});
