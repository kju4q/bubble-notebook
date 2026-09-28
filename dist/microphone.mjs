import {clamp,soundCharacter} from './detector.mjs';

// Read the opened track, not the order of the device list. Some browsers return
// a 'default' alias; resolve it only when its group or label matches one input.
export function activeMicrophone(track,devices=[]){
  const settings=track.getSettings?.()||{};
  const inputs=devices.filter(d=>d.kind==='audioinput'&&!['default','communications',''].includes(d.deviceId));
  const label=(track.label||'').replace(/^default\s*[-–:]?\s*/i,'');
  const exact=inputs.find(d=>d.deviceId===settings.deviceId);
  const matches=inputs.filter(d=>(settings.groupId&&d.groupId===settings.groupId)||(label&&d.label===label));
  const device=exact||(matches.length===1?matches[0]:null);
  const id=device?.deviceId||settings.deviceId||'';
  return {id,label:device?.label||label||'Microphone (name unavailable)',
    key:device?.deviceId||(!['default','communications'].includes(id)&&id)||settings.groupId||label||'default',settings};
}

// Calibrate electrical gain from an intentional breath at the filming distance.
// Keep the original absolute gate floor, room-noise ratio, and speech checks.
// Noise floor and signal receive exactly the same gain; SNR cannot be invented.
export function breathLevelSample(features,rawNoise,boost){
  const {voice,noiseLike}=soundCharacter(features),raw=features.rms/boost;
  return !voice&&noiseLike&&raw>Math.max(.0001,rawNoise*6)?raw:null;
}
export function calibratedBoost(levels,rawNoise){
  if(levels.length<24)return null;
  const sorted=[...levels].sort((a,b)=>a-b),breath=sorted[Math.floor(sorted.length*.5)];
  const boost=clamp(.03/breath,1,8);
  // Reject a setup that is still too quiet or too close to the room noise.
  if(breath*boost<.012||breath<rawNoise*6)return null;
  return {boost:Math.round(boost*100)/100,breath};
}
