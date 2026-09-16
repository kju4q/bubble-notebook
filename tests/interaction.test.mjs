import test from 'node:test';
import assert from 'node:assert/strict';
import {BubbleInteraction,keepInside,handPoint} from '../dist/interaction.mjs';

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
