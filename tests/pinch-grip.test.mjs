import test from 'node:test';
import assert from 'node:assert/strict';
import {PinchGrip,BubbleInteraction} from '../dist/interaction.mjs';

function landmarks(x,ratio){
  const points=Array.from({length:21},()=>({x:.5,y:.5}));
  points[0]={x:.5,y:.8};points[9]={x:.5,y:.6};
  points[8]={x:1-x/400,y:.25};points[4]={x:points[8].x+ratio*.2,y:.25};
  return points;
}
test('one borderline open reading cannot drop or transfer a bubble in an overlap',()=>{
  const a={id:1,x:100,y:100,r:40},b={id:2,x:250,y:100,r:40},events=[];
  const pinch=new PinchGrip(),control=new BubbleInteraction({pick:(x,y)=>[b,a].find(b=>Math.hypot(x-b.x,y-b.y)<=b.r),onGrab:b=>events.push(['grab',b.id]),onRelease:b=>events.push(['release',b.id]),onMove:(b,x,y)=>Object.assign(b,{x,y})});
  const at=(x,ratio,time)=>{const point=pinch.update(landmarks(x,ratio),time,!!control.held);control.update({...point,x:point.x*400,y:point.y*400},time);};
  at(100,1,0);at(100,.25,33);at(250,.25,66);at(260,.62,99);at(280,.47,132);
  assert.equal(control.held,a);assert.deepEqual(events,[['grab',1]]);assert.equal(a.x,280);assert.equal(b.x,250);
  at(290,1,165);assert.equal(control.held,null);assert.deepEqual(events,[['grab',1],['release',1]]);
});
test('a sustained small opening releases after confirmation; a clear opening releases immediately',()=>{
  const grip=new PinchGrip();grip.update(landmarks(100,.25),0);
  assert.equal(grip.update(landmarks(100,.65),100,true).closed,true);
  assert.equal(grip.update(landmarks(100,.65),133,true).closed,false);
  grip.update(landmarks(100,.25),166);
  assert.equal(grip.update(landmarks(100,1),199,true).closed,false);
});
test('idle selection and geometry gestures keep the original immediate pinch decisions',()=>{
  const grip=new PinchGrip();grip.update(landmarks(100,.25),0);
  assert.equal(grip.update(landmarks(100,.65),33,false).closed,false);
});
test('a missing frame clears pending release evidence and reset clears the grip',()=>{
  const grip=new PinchGrip();grip.update(landmarks(100,.25),0);grip.update(landmarks(100,.65),33,true);
  assert.equal(grip.update(null,66,true),null);
  assert.equal(grip.update(landmarks(100,.65),99,true).closed,true);
  grip.reset();assert.equal(grip.closed,false);assert.equal(grip.openSince,null);
});
test('two deliberate quick pinches still pop exactly once through the camera grip filter',()=>{
  const bubble={x:100,y:100},events=[],grip=new PinchGrip();
  const control=new BubbleInteraction({pick:()=>bubble,onPop:()=>events.push('pop')});
  for(const [time,ratio]of [[0,1],[33,.25],[99,1],[165,.25],[231,1],[264,1]]){
    const point=grip.update(landmarks(100,ratio),time,!!control.held);
    control.update({...point,x:100,y:100},time);
  }
  assert.deepEqual(events,['pop']);
});
