import test from 'node:test';
import assert from 'node:assert/strict';
import {activeMicrophone,breathLevelSample,calibratedBoost} from '../dist/microphone.mjs';

const devices=[{kind:'audioinput',deviceId:'builtin',groupId:'laptop',label:'Laptop microphone'},
  {kind:'audioinput',deviceId:'external',groupId:'usb',label:'USB microphone'}];
test('the opened track determines the active device, even when it is not first',()=>{
  const active=activeMicrophone({label:'USB microphone',getSettings:()=>({deviceId:'external'})},devices);
  assert.equal(active.id,'external');assert.equal(active.key,'external');assert.equal(active.label,'USB microphone');
});
test('default aliases resolve by track group; ambiguous aliases are not guessed',()=>{
  assert.equal(activeMicrophone({label:'Default - USB microphone',getSettings:()=>({deviceId:'default',groupId:'usb'})},devices).id,'external');
  assert.equal(activeMicrophone({label:'Unknown',getSettings:()=>({deviceId:'default'})},devices).id,'default');
});
test('a quiet calibrated breath gets bounded gain without changing its noise ratio',()=>{
  const rawNoise=.0002,result=calibratedBoost(Array(80).fill(.004),rawNoise);
  assert.equal(result.boost,7.5);assert.equal((.004*result.boost)/(rawNoise*result.boost),20);
  assert.equal(calibratedBoost(Array(80).fill(.09),rawNoise).boost,1);
  assert.equal(calibratedBoost(Array(80).fill(.0003),rawNoise),null);
  assert.equal(calibratedBoost(Array(4).fill(.004),rawNoise),null);
});
test('distance calibration rejects voiced samples and room noise',()=>{
  const f={rms:.004,periodicity:.94,flatness:.005,lowFraction:.4};
  assert.equal(breathLevelSample(f,.0002,1),null);
  assert.equal(breathLevelSample({...f,periodicity:.1,flatness:.3,rms:.0003},.0002,1),null);
  assert.equal(breathLevelSample({...f,periodicity:.1,flatness:.3},.0002,1),.004);
});
