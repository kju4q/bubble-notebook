import test from 'node:test';
import assert from 'node:assert/strict';
import {BubbleInteraction,keepInside,handPoint,smoothHandCursor} from '../dist/interaction.mjs';

function fixture(){
  const bubble={x:100,y:100,r:30,vx:0,vy:0};
  const events=[];
  const control=new BubbleInteraction({pick:(x,y)=>Math.hypot(x-bubble.x,y-bubble.y)<40?bubble:null,
    onGrab:()=>events.push('grab'),onRelease:()=>events.push('release'),onPop:()=>events.push('pop'),
    onMove:(b,x,y)=>Object.assign(b,{x,y})});
  const at=(x,y,closed,time)=>control.update({x,y,closed},time);
  return {bubble,events,control,at};
}
test('closed hand appearing does not grab until an open hand is seen',()=>{
  const f=fixture();f.at(100,100,true,0);assert.equal(f.control.held,null);
  f.at(100,100,false,100);f.at(100,100,true,200);assert.equal(f.control.held,f.bubble);
});
test('held pinch moves by the fingertip offset and opening releases without popping',()=>{
  const f=fixture();f.at(110,100,false,0);f.at(110,100,true,100);f.at(200,180,true,700);
  assert.deepEqual([f.bubble.x,f.bubble.y],[190,180]);f.at(200,180,false,800);
  assert.deepEqual(f.events,['grab','release']);assert.equal(f.control.lastTap,null);
});
test('two quick pinches pop exactly once',()=>{
  const f=fixture();f.at(100,100,false,0);f.at(100,100,true,100);f.at(100,100,false,180);
  f.at(100,100,true,280);f.at(100,100,false,370);f.at(100,100,false,450);
  assert.deepEqual(f.events,['grab','release','grab','release','pop']);
});
test('slow double pinch and a dragged second pinch do not pop',()=>{
  const f=fixture();f.at(100,100,false,0);f.at(100,100,true,100);f.at(100,100,false,180);
  f.at(100,100,true,900);f.at(100,100,false,990);assert.ok(!f.events.includes('pop'));
  f.at(100,100,true,1100);f.at(160,100,true,1150);f.at(160,100,false,1200);
  assert.ok(!f.events.includes('pop'));
});
test('tracking loss releases a held bubble and clears a pending pop',()=>{
  const f=fixture();f.at(100,100,false,0);f.at(100,100,true,100);f.control.update(null,200);
  assert.equal(f.control.held,null);assert.equal(f.control.lastTap,null);assert.equal(f.control.armed,false);
  assert.deepEqual(f.events,['grab','release']);
});
test('one tap expires even without another input event',()=>{
  const f=fixture();f.at(100,100,false,0);f.at(100,100,true,100);f.at(100,100,false,180);
  f.control.expire(1000);assert.equal(f.control.lastTap,null);
});
test('two taps on different bubbles do not pop either one',()=>{
  const a={x:10,y:10},b={x:100,y:10};let popped=0;
  const c=new BubbleInteraction({pick:x=>x<50?a:b,onPop:()=>popped++});
  c.update({x:10,y:10,closed:false},0);c.update({x:10,y:10,closed:true},50);c.update({x:10,y:10,closed:false},100);
  c.update({x:100,y:10,closed:true},200);c.update({x:100,y:10,closed:false},250);assert.equal(popped,0);
});
test('edges contain the whole bubble and reverse outward velocity',()=>{
  const b={x:-10,y:900,r:20,vx:-8,vy:6},area={left:0,right:300,top:0,bottom:200};
  keepInside(b,area);assert.deepEqual([b.x,b.y],[20,180]);assert.ok(b.vx>0&&b.vy<0);
  b.x=400;b.y=-20;keepInside(b,area);assert.deepEqual([b.x,b.y],[280,20]);assert.ok(b.vx<0&&b.vy>0);
});
test('normalized hand cursor is mirrored and pinch has hysteresis',()=>{
  const hand=Array.from({length:21},()=>({x:.5,y:.5}));hand[0]={x:.5,y:.9};hand[9]={x:.5,y:.5};
  hand[8]={x:.3,y:.3};hand[4]={x:.42,y:.3};assert.equal(handPoint(hand).closed,true);
  assert.equal(handPoint(hand).x,.7);hand[4].x=.49;assert.equal(handPoint(hand,false).closed,false);assert.equal(handPoint(hand,true).closed,true);
  hand[4].x=.6;assert.equal(handPoint(hand,true).closed,false);assert.equal(handPoint([]),null);
});

test('still hold needs two seconds, tolerates small jitter, and release clears it',()=>{
  const f=fixture();f.at(100,100,false,0);f.at(100,100,true,100);
  f.at(104,103,true,900);f.at(98,100,true,1600);
  assert.equal(f.control.readyToExplore(2099),false);
  assert.equal(f.control.readyToExplore(2100),true);
  f.at(98,100,false,2110);assert.equal(f.control.readyToExplore(5000),false);
});
test('dragging for longer than two seconds postpones geometry until a fresh still hold',()=>{
  const f=fixture();f.at(100,100,false,0);f.at(100,100,true,100);
  for(let t=500;t<=3500;t+=500){f.at(100+t/10,100,true,t);assert.equal(f.control.readyToExplore(t),false);}
  assert.equal(f.control.readyToExplore(5499),false);
  assert.equal(f.control.readyToExplore(5500),true);
  f.control.cancel();assert.equal(f.control.readyToExplore(8000),false);
  f.at(450,100,false,8100);f.at(450,100,true,8200);
  assert.equal(f.control.readyToExplore(10199),false);
});
test('cursor follows a moving fingertip within four pixels at 30 fps without overshoot',()=>{
  let cursor={x:0,y:0,closed:false};
  for(let i=1;i<=30;i++){
    const target={x:i*50,y:i*20,closed:true};cursor=smoothHandCursor(cursor,target,1000/30);
    assert.ok(Math.hypot(cursor.x-target.x,cursor.y-target.y)<4);
    assert.ok(cursor.x<=target.x&&cursor.y<=target.y);assert.equal(cursor.closed,true);
  }
});
test('cursor smoothing follows elapsed time and resets on reacquisition',()=>{
  const origin={x:0,y:0,closed:false},target={x:100,y:80,closed:true};
  const once=smoothHandCursor(origin,target,32),twice=smoothHandCursor(smoothHandCursor(origin,target,16),target,16);
  assert.ok(Math.abs(once.x-twice.x)<1e-10&&Math.abs(once.y-twice.y)<1e-10);
  assert.deepEqual(smoothHandCursor(null,target,16),target);
  assert.deepEqual(smoothHandCursor(origin,target,250),target);
});

test('overlapping bubbles never change the owner of a continuous drag',()=>{
  const a={x:100,y:100,r:30},b={x:240,y:100,r:30},events=[];let picks=0;
  const control=new BubbleInteraction({pick:(x,y)=>{picks++;return [b,a].find(b=>Math.hypot(x-b.x,y-b.y)<40);},onGrab:b=>events.push(b),onMove:(b,x,y)=>Object.assign(b,{x,y})});
  control.update({x:110,y:100,closed:false},0);control.update({x:110,y:100,closed:true},50);
  const before=picks;
  for(const [i,x]of [240,250,300,350].entries()){
    control.update({x,y:100,closed:true},100+i*50);
    assert.equal(control.held,a);assert.equal(a.x,x-10);assert.equal(b.x,240);
  }
  assert.equal(picks,before,'Moving a captured bubble must not hit-test any other bubble');
  assert.deepEqual(events,[a]);
});
