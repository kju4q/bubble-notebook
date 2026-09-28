import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraHands} from '../dist/hands.mjs';

for(const videoCallbacks of [true,false])test(`camera processes fresh 30 fps frames once (${videoCallbacks?'video callbacks':'display fallback'})`,async()=>{
  const names=['navigator','requestAnimationFrame','cancelAnimationFrame'];
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  let queued=null,stopped=false,request;
  const track={stop(){stopped=true;}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async options=>{request=options;return stream;}}}});
  globalThis.requestAnimationFrame=callback=>{queued=callback;return 1;};
  globalThis.cancelAnimationFrame=()=>{queued=null;};
  let presentedFrames=0;
  const video={readyState:2,currentTime:0,play:async()=>{},pause(){},getVideoPlaybackQuality:()=>({totalVideoFrames:presentedFrames})};
  if(videoCallbacks){
    video.requestVideoFrameCallback=callback=>{queued=callback;return 2;};
    video.cancelVideoFrameCallback=()=>{queued=null;};
    globalThis.requestAnimationFrame=()=>{throw Error('Video callbacks should drive tracking when available');};
  }
  const camera=new CameraHands({video,onPoint(){},onStatus(){}});
  camera.detector={detectForVideo:()=>({landmarks:[]})};
  try{
    await camera.start();
    for(let i=0;i<30;i++){
      presentedFrames++;video.currentTime=i/30;queued(100+i*1000/30,videoCallbacks?{presentedFrames}:undefined);
      const frames=camera.frames;video.currentTime+=.016;queued(100+i*1000/30+16,videoCallbacks?{presentedFrames}:undefined);
      assert.equal(camera.frames,frames,'A repeated video frame must not run inference again');
    }
    assert.equal(camera.frames,30,'The 65 ms gate must not discard alternate camera frames');
    assert.deepEqual(request.video.frameRate,{ideal:30,max:30});
    camera.stop();assert.equal(stopped,true);assert.equal(queued,null);
  }finally{
    for(const [name,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
});
