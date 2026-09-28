// Test-only scripted landmarks, loaded as a same-origin module under the production CSP.
import{CameraHands}from'../dist/hands.mjs';
const start=CameraHands.prototype.start;
CameraHands.prototype.start=function(){this.detector={detectForVideo:()=>{const points=window.__overlapQueue?.length?window.__overlapQueue.shift():window.__overlapLandmarks;window.__overlapFrames=(window.__overlapFrames||0)+1;return{landmarks:points?[points]:[]};},close(){}};return start.call(this);};
window.__overlapReady=true;
