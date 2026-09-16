import test from 'node:test';
import assert from 'node:assert/strict';
import {sphereComparison,rotatePoint,GeometryLens} from '../dist/geometry.mjs';

test('doubling a sphere gives 4× area, 8× volume and half excess pressure',()=>{
  const a=sphereComparison(1),b=sphereComparison(2);
  assert.equal(b.surfaceArea/a.surfaceArea,4);assert.equal(b.enclosedVolume/a.enclosedVolume,8);
  assert.equal(b.pressure,.5);assert.throws(()=>sphereComparison(0));
});
test('3D rotation preserves radius at varied orientations',()=>{
  for(const p of [[1,0,0],[0,1,0],[0,0,1],[.6,.8,0]])for(const yaw of [0,.3,2,4]){
    const q=rotatePoint(p,yaw,-.45);assert.ok(Math.abs(Math.hypot(...q)-1)<1e-12);
  }
});
test('opening, hand rotation, resize and closing do not mutate the original bubble',()=>{
  const b={id:1,x:120,y:140,r:44,note:{h:195,f:440}},copy=structuredClone(b),lens=new GeometryLens();
  lens.open(b);const dims={width:400,height:455,track:{left:30,right:370,y:400}};
  lens.input({x:100,y:100,closed:true},0,dims);assert.equal(lens.drag,null);
  lens.input({x:100,y:100,closed:false},10,dims);lens.input({x:100,y:100,closed:true},20,dims);
  const yaw=lens.yaw;lens.input({x:200,y:120,closed:true},30,dims);assert.notEqual(lens.yaw,yaw);
  lens.input({x:200,y:120,closed:false},40,dims);lens.input({x:370,y:400,closed:true},50,dims);
  assert.equal(lens.scale,2);assert.equal(lens.status().ratios.volume,8);
  lens.step(.1,100,true);assert.equal(lens.progress,1);lens.close();lens.step(.1,200,true);
  assert.equal(lens.progress,0);assert.deepEqual(b,copy);
});
