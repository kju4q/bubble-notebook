import{handPoint}from'./interaction.mjs';

export class CameraHands{
  constructor({video,onPoint,onStatus}){Object.assign(this,{video,onPoint,onStatus});this.state='off';this.stream=null;this.detector=null;this.generation=0;this.raf=0;this.lastFrame=-1;this.lastRun=0;this.seenAt=0;this.closed=false;this.modelVersion='1.0.1';this.frames=0;}
  async start(){
    if(this.state!=='off'&&this.state!=='error')return;
    const token=++this.generation;this.state='requesting';this.onStatus('Allow camera access, then hold one hand in view.');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS or localhost.');
      const received=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}},audio:false});
      if(token!==this.generation){received.getTracks().forEach(t=>t.stop());return;}
      this.stream=received;this.video.srcObject=received;await this.video.play();
      this.stream.getVideoTracks()[0].onended=()=>this.stop('Camera disconnected. Start it again to continue.');
      this.state='loading';this.onStatus('Loading hand tracking… this can take a few seconds.');
      if(!this.detector){
        const {FilesetResolver,HandLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
        const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href);
        const base={modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',import.meta.url).href};
        let detector;
        try{detector=await HandLandmarker.createFromOptions(files,{baseOptions:{...base,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.5});}
        catch{detector=await HandLandmarker.createFromOptions(files,{baseOptions:{...base,delegate:'CPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.5});}
        if(token!==this.generation){detector.close();return;}this.detector=detector;
      }
      if(token!==this.generation)return;
      this.state='ready';this.lastFrame=-1;this.lastRun=0;this.seenAt=0;this.closed=false;this.onStatus('Show an open hand. Your fingertip becomes the cursor.');
      const loop=now=>{
        if(token!==this.generation||this.state==='off')return;
        if(this.video.readyState>=2&&this.video.currentTime!==this.lastFrame&&now-this.lastRun>=65){
          this.lastRun=now;this.lastFrame=this.video.currentTime;
          try{
            const result=this.detector.detectForVideo(this.video,now);this.frames++;
            const point=handPoint(result.landmarks[0],this.closed);
            if(point){this.seenAt=now;this.closed=point.closed;this.state='tracking';this.onPoint(point,now);}
            else if(!this.seenAt||now-this.seenAt>250){this.state='ready';this.closed=false;this.onPoint(null,now);this.onStatus('Hand out of view. Show an open hand to continue.');}
          }catch{this.stop('Tracking paused. Restart the camera to try again.');return;}
        }
        this.raf=requestAnimationFrame(loop);
      };this.raf=requestAnimationFrame(loop);
    }catch(e){
      if(token!==this.generation)return;
      const messages={NotAllowedError:'Camera access was blocked. Allow it in your browser’s site settings, then start again.',NotFoundError:'No camera found. You can still drag and double-click a bubble.',NotReadableError:'The camera could not start. Check whether another app is using it.'};
      this.stop(messages[e.name]||'Hand tracking could not load. Check your connection and start the camera again.');this.state='error';
    }
  }
  stop(message='Camera is off. You can still drag bubbles with the pointer.'){
    this.generation++;cancelAnimationFrame(this.raf);this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.video.pause();this.video.srcObject=null;this.state='off';this.closed=false;this.onPoint(null,performance.now());this.onStatus(message);
  }
  dispose(){this.stop();this.detector?.close();this.detector=null;}
}
