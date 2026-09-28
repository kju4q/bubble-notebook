import{BreathGate,audioFeatures,clamp,db}from'./detector.mjs';
import{BubbleInteraction,keepInside,smoothHandCursor}from'./interaction.mjs';
import{CameraHands}from'./hands.mjs';
import{GeometryLens}from'./geometry.mjs';
import{activeMicrophone,breathLevelSample,calibratedBoost}from'./microphone.mjs';
import{drawBubbleLens,drawBubbleFilm}from'./bubble-film.mjs';
import{prepareDrift,advanceDrift,resizeDrift}from'./bubble-drift.mjs';
const $=id=>document.getElementById(id);
const ui={mic:$('mic-button'),recal:$('recalibrate'),status:$('status'),hint:$('hint'),device:$('device'),sens:$('sensitivity'),filter:$('filter'),sound:$('sound'),level:$('level'),fill:$('meter-fill'),marker:$('threshold-marker'),count:$('count'),diag:$('diagnostic'),activeMic:$('active-microphone'),distance:$('calibrate-distance'),paper:$('paper-state'),note:$('note-label')};
const canvas=$('scene'),g=canvas.getContext('2d'),gate=new BreathGate();
const notes=[{name:'C5',f:523.25,h:195},{name:'A4',f:440,h:280},{name:'G4',f:392,h:30},{name:'E4',f:329.63,h:140},{name:'D4',f:293.66,h:175},{name:'C4',f:261.63,h:195}];
let context=null,stream=null,source=null,analyser=null,silent=null,pcm=null,spectrum=null;
let inputGain=null,micTimer=0,micBoost=1,activeInput=null,deviceList=[],deviceEnumeration=0;
let breathCalibrationEnd=0,breathSamples=[],rawNoise=.002;
const micProfiles=new Map();
let running=false,pending=false,attempt=0,calibrationEnd=0,noiseSamples=[],blockedUntil=0,framePrevious=0,lastMeasure=0,lastUi=0;
let w=800,h=390,dpr=1,current=null,bubbles=[],total=0,lastNote=null,raf=0,metrics={levelDb:null,thresholdDb:null,detected:false},mode='off';
const voices=new Set(),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let bubbleId=0,popped=0,held=null,hover=null,cursor=null,particles=[],pointerActive=false,keyboardSelection=null,inputSource=null;
const geometry=new GeometryLens({onChange:updateGeometryUI});
let cursorAt=0;
const particleLifetime=2.1;
function updateGeometryUI(state){
  document.querySelector('.notebook').classList.toggle('geometry-active',state.active);
  for(const id of ['geometry-panel','geometry-scale-wrap','geometry-back'])$(id).hidden=!state.active;
  $('geometry-open').disabled=state.active;$('practice').disabled=state.active;
  $('geometry-scale').value=state.scale;
  $('geometry-scale').style.setProperty('--radius-progress',((state.scale-1)*100)+'%');
  $('geometry-scale').setAttribute('aria-valuetext',state.scale.toFixed(2)+' times the original radius');
  for(const key of ['radius','area','volume','pressure'])$('geometry-'+key).textContent=state.ratios[key].toFixed(2)+'×';
  $('geometry-scale-value').textContent=state.scale.toFixed(2)+'×';
  $('geometry-summary').textContent=state.scale===1?'Same radius. Same geometry.':state.scale===2?'Twice the radius. Four times the surface. Eight times the volume.':state.ratios.area.toFixed(2)+'× surface area · '+state.ratios.volume.toFixed(2)+'× volume · '+state.ratios.pressure.toFixed(2)+'× excess pressure.';
}
function openGeometry(b){
  if(!b||geometry.active)return;
  notebookAction('geometry');
  if(current)releaseBubble(false);
  interaction.cancel();keyboardSelection=null;hover=null;gate.reset();
  geometry.open(b);status('Geometry view · return to the notebook to blow more bubbles.');
  ui.paper.textContent='The geometry inside your bubble.';
  canvas.setAttribute('aria-label','3D sphere. Drag to rotate. Use the radius slider to compare sizes. Escape returns to bubbles.');
}
function closeGeometry(){
  if(!geometry.active)return;
  geometry.close();interaction.cancel();cursor=null;pointerActive=false;blockedUntil=performance.now()+500;
  ui.paper.textContent='Back in your notebook. Your bubbles are still here.';
  status(running?'Ready. Blow gently toward your microphone.':'Start the microphone to make another bubble.');
  canvas.setAttribute('aria-label','Bubble page. Drag to move; hold still for two seconds to reveal geometry; double-click to pop.');
}
function geometryInput(point,now){
  const c=canvas.getBoundingClientRect(),r=$('geometry-scale').getBoundingClientRect();
  const playScale=point&&!point.closed&&geometry.drag?.mode==='scale';
  geometry.input(point,now,{width:w,height:h,track:{left:r.left-c.left+15,right:r.right-c.left-15,y:r.top-c.top+r.height/2}});
  if(playScale)geometryTone();
}
function geometryTone(){if(!geometry.source||!ui.sound.checked)return;void ensureAudio().then(()=>{playNote(geometry.source.frequency/geometry.scale,.4);blockedUntil=performance.now()+1700;});}
$('geometry-back').addEventListener('click',closeGeometry);
$('geometry-open').addEventListener('click',()=>{if(!bubbles.length)$('practice').click();openGeometry(keyboardSelection||hover||bubbles.at(-1));});
$('geometry-scale').addEventListener('input',e=>geometry.setScale(Number(e.target.value)));
$('geometry-scale').addEventListener('change',geometryTone);
$('geometry-double').addEventListener('click',()=>{geometry.setScale(2);geometryTone();});
$('geometry-reset').addEventListener('click',()=>{geometry.setScale(1);geometryTone();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&geometry.active){closeGeometry();$('geometry-open').focus();}});
const bounds=()=>({left:50,right:w-12,top:50,bottom:h-35});
const countBubbles=()=>{ui.count.textContent=bubbles.length+' on page · '+popped+' popped';};
function pick(x,y){return [...bubbles].reverse().find(b=>Math.hypot(x-b.x,y-b.y)<=b.r+10)||null;}
const interaction=new BubbleInteraction({pick,onGrab(b){held=b;const index=bubbles.indexOf(b);bubbles.splice(index,1);bubbles.push(b);b.vx=b.vy=0;ui.paper.textContent='Move to explore. Hold still for two seconds to reveal the geometry.';notebookAction('grab');},onMove(b,x,y){b.x=x;b.y=y;keepInside(b,bounds());},onRelease(b){held=null;b.vx=b.vy=0;ui.paper.textContent='Released. Two quick pinches will pop it.';notebookAction('release');},onPop:popBubble});
function handStatus(message){const el=$('hand-status');if(el.textContent!==message)el.textContent=message;$('camera-preview').hidden=!hands.stream;const on=!['off','error'].includes(hands.state);$('camera-button').textContent=on?'Stop hand camera':'Start hand camera';}
// Let a pending pointer double-click finish before camera callbacks take over.
const hands=new CameraHands({video:$('hand-video'),onStatus:handStatus,isHolding:()=>!!held&&!geometry.active,onPoint(point,now){if(pointerActive||(inputSource==='pointer'&&interaction.lastTap&&now-interaction.lastTap.time<650))return;if(inputSource!=='hand'){interaction.cancel();cursor=null;inputSource='hand';}if(!point){cursor=null;interaction.cancel();geometryInput(null,now);hover=null;return;}const target=smoothHandCursor(cursor,{x:50+point.x*(w-62),y:50+point.y*(h-85),closed:point.closed},now-cursorAt);cursor=target;cursorAt=now;if(geometry.active){geometryInput(target,now);handStatus('Pinch to rotate the sphere · pinch along the slider to resize.');return;}interaction.update(target,now);hover=interaction.hover;handStatus(held?'Holding a bubble · open your fingers to release.':hover?'Bubble selected · pinch to grab, double-pinch to pop.':'Hand found · point your index finger at a bubble.');}});
async function ensureAudio(){try{const C=window.AudioContext||window.webkitAudioContext;context??=new C();if(context.state==='suspended')await context.resume();}catch{}}
function popBubble(b){if(!bubbles.includes(b))return;const idx=bubbles.indexOf(b);bubbles.splice(idx,1);held=null;hover=null;if(keyboardSelection===b)keyboardSelection=null;popped++;lastNote=b.note.name;ui.note.textContent=b.note.name;ui.paper.textContent='Pop. '+b.note.name+' floats into a note.';countBubbles();for(let i=0;i<14;i++){const a=i/14*Math.PI*2;particles.push({x:b.x+Math.cos(a)*b.r,y:b.y+Math.sin(a)*b.r,vx:Math.cos(a)*24,vy:Math.sin(a)*24-5,age:0,h:b.note.h});}if(ui.sound.checked){playNote(b.note.f,b.intensity);blockedUntil=performance.now()+950;}}
$('camera-button').addEventListener('click',()=>{if(!['off','error'].includes(hands.state))hands.stop();else{void ensureAudio();hands.start();}});
$('practice').addEventListener('click',()=>{void ensureAudio();if(bubbles.length>=18){ui.paper.textContent='Pop a bubble to make room for another.';return;}const r=44,b={id:++bubbleId,x:w*.5,y:h*.46,r,volume:r**3,note:noteForRadius(r),vx:0,vy:-4,age:0,seed:Math.random()*10,intensity:.4};prepareDrift(b,bubbles,bounds(),reduceMotion);bubbles.push(b);keepInside(b,bounds());countBubbles();ui.paper.textContent='Practice bubble. Point, pinch, move, pop.';});
function pointerPoint(e,closed){const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top,closed};}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;void ensureAudio();pointerActive=true;if(inputSource!=='pointer')interaction.cancel();inputSource='pointer';keyboardSelection=null;const p=pointerPoint(e,false);if(geometry.active){geometryInput(p,performance.now());geometryInput({...p,closed:true},performance.now());canvas.setPointerCapture(e.pointerId);return;}interaction.update(p,performance.now());interaction.update({...p,closed:true},performance.now());hover=interaction.hover;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!pointerActive)return;const p=pointerPoint(e,true);if(geometry.active){geometryInput(p,performance.now());return;}interaction.update(p,performance.now());hover=interaction.hover;});
canvas.addEventListener('pointerup',e=>{if(!pointerActive)return;if(geometry.active){geometryInput(pointerPoint(e,false),performance.now());pointerActive=false;return;}interaction.update(pointerPoint(e,false),performance.now());hover=interaction.hover;pointerActive=false;});
for(const type of['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{if(pointerActive){interaction.cancel();geometryInput(null,performance.now());held=null;pointerActive=false;}});
canvas.addEventListener('keydown',e=>{if(geometry.active){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();geometry.yaw+=(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0);geometry.pitch=clamp(geometry.pitch+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0),-1.3,1.3);}return;}if(![' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();void ensureAudio();if(e.key===' '||!bubbles.includes(keyboardSelection)){keyboardSelection=bubbles[(bubbles.indexOf(keyboardSelection)+1)%bubbles.length]||null;hover=keyboardSelection;return;}if(e.key==='Enter'){popBubble(keyboardSelection);return;}const step=e.shiftKey?30:10;keyboardSelection.x+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);keyboardSelection.y+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);keepInside(keyboardSelection,bounds());});
function status(message,kind=''){if(ui.status.textContent!==message)ui.status.textContent=message;ui.status.dataset.kind=kind;}
function setMode(next){mode=next;}
function notebookAction(action){document.dispatchEvent(new CustomEvent('notebook-action',{detail:action}));}
function noteForRadius(radius){const f=523.25*28/Math.max(28,radius);return notes.reduce((a,b)=>Math.abs(Math.log(b.f/f))<Math.abs(Math.log(a.f/f))?b:a);}
function dimensions(){const box=canvas.getBoundingClientRect();w=box.width;h=box.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);bubbles.forEach(b=>{keepInside(b,bounds());resizeDrift(b);});}
new ResizeObserver(dimensions).observe(canvas);
function origin(){return{x:w*.5,y:h-58};}
function newBubble(){if(bubbles.length>=18){status('Page full. Pop a bubble to make room.');return;}const o=origin();current={id:++bubbleId,x:o.x,y:o.y-20,r:20,note:notes[0],volume:20**3,vx:0,vy:0,age:0,seed:Math.random()*10,intensity:.2};}
function growBubble(intensity,dt){if(!current)return;current.volume+=dt*(10000+intensity*140000);current.r=Math.min(86,Math.cbrt(current.volume));current.note=noteForRadius(current.r);current.intensity=Math.max(current.intensity,intensity);const o=origin();current.x=o.x;current.y=o.y-current.r+6;ui.note.textContent=current.note.name;}
function releaseBubble(play=true){if(!current)return;const b=current;current=null;b.vx=(Math.random()-.5)*12;b.vy=-14;b.age=0;prepareDrift(b,bubbles,bounds(),reduceMotion);bubbles.push(b);keepInside(b,bounds());total++;lastNote=b.note.name;countBubbles();if(play&&ui.sound.checked){playNote(b.note.f,b.intensity);blockedUntil=performance.now()+950;}ui.paper.textContent='Your bubble stays here. Grab it or pop a note.';notebookAction('bubble-released');}
function playNote(f,intensity=.4){if(!context||context.state!=='running')return;const t=context.currentTime;const out=context.createGain();out.gain.value=.13+.07*clamp(intensity,0,1);out.connect(context.destination);voices.add(out);[1,2,3.005].forEach((ratio,i)=>{const osc=context.createOscillator(),env=context.createGain();osc.type='sine';osc.frequency.value=f*ratio;env.gain.setValueAtTime(.0001,t);env.gain.exponentialRampToValueAtTime([.65,.14,.025][i],t+.012);env.gain.exponentialRampToValueAtTime(.0001,t+[1.5,.75,.35][i]);osc.connect(env);env.connect(out);osc.start(t);osc.stop(t+1.6);osc.onended=()=>{osc.disconnect();env.disconnect();};});setTimeout(()=>{out.disconnect();voices.delete(out);},1800);}
function hush(){if(context)for(const v of voices)v.gain.setTargetAtTime(0,context.currentTime,.015);}
function showActiveMicrophone(){
  ui.activeMic.textContent=activeInput&&running?'Active: '+activeInput.label:pending?'Opening the selected microphone…':'Microphone off · choose an input, then start.';
}
function saveMicProfile(){
  micProfiles.set(activeInput?.key||ui.device.value||'default',{sensitivity:gate.sensitivity,boost:micBoost});
}
function beginCalibration(){
  if(!running)return;if(current)releaseBubble(false);
  gate.reset();noiseSamples=[];breathCalibrationEnd=0;breathSamples=[];
  calibrationEnd=performance.now()+2000;blockedUntil=0;hush();setMode('calibrating');
  status('Stay quiet… calibrating '+activeInput.label+' for two seconds.');
  ui.paper.textContent='Listening to the room.';ui.recal.disabled=ui.distance.disabled=true;
}
function calibrateDistance(){
  if(!running||calibrationEnd)return;if(current)releaseBubble(false);
  gate.reset();hush();blockedUntil=0;breathSamples=[];breathCalibrationEnd=performance.now()+3000;
  ui.recal.disabled=ui.distance.disabled=true;setMode('calibrating-distance');
  status('Blow gently for two seconds from your filming position.');
  ui.paper.textContent='Setting your blowing distance. This breath will not make a bubble.';
}
function cleanup(){
  clearInterval(micTimer);micTimer=0;running=false;calibrationEnd=breathCalibrationEnd=0;gate.reset();
  if(current)releaseBubble(false);
  if(stream)stream.getTracks().forEach(t=>{t.onended=null;t.stop();});
  stream=null;activeInput=null;
  for(const n of[source,inputGain,analyser,silent]){try{n?.disconnect();}catch{}}
  source=inputGain=analyser=silent=null;hush();ui.recal.disabled=ui.distance.disabled=true;
  for(const option of ui.device.options)option.textContent=option.textContent.replace(/ — active$/,'');
  ui.device.disabled=false;ui.fill.style.width='0%';ui.level.textContent='— dB';
  document.querySelector('.meter').setAttribute('aria-valuenow','0');
  metrics={levelDb:null,thresholdDb:null,detected:false};showActiveMicrophone();
}
function stop(message='Microphone stopped. Your bubbles can keep floating.'){
  attempt++;pending=false;cleanup();setMode('off');ui.mic.textContent='Start microphone';status(message);ui.diag.textContent='Microphone is off.';
}
async function populateDevices(){
  const refresh=++deviceEnumeration;
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();if(refresh!==deviceEnumeration)return;
    deviceList=devices;const selected=ui.device.value,previous=ui.device.selectedOptions[0]?.textContent;
    if(running&&stream){
      const next=activeMicrophone(stream.getAudioTracks()[0],devices);
      if(activeInput&&next.key!==activeInput.key){
        const sameDevice=next.label===activeInput.label;saveMicProfile();activeInput=next;
        const profile=micProfiles.get(next.key)||(sameDevice?{sensitivity:gate.sensitivity,boost:micBoost}:{sensitivity:50,boost:1});
        gate.sensitivity=profile.sensitivity;micBoost=profile.boost;inputGain.gain.value=micBoost;
        ui.sens.value=String(gate.sensitivity);$('sensitivity-value').value=ui.sens.value;beginCalibration();
      }else activeInput=next;
    }
    const system=devices.find(d=>d.kind==='audioinput'&&d.deviceId==='default');
    const defaultName=(system?.label||'').replace(/^default\s*[-–:]?\s*/i,'');
    const defaultLabel='System default'+(defaultName?' — '+defaultName:' (browser chooses)');
    ui.device.replaceChildren(new Option(defaultLabel,''));
    for(const d of devices.filter(d=>d.kind==='audioinput'&&d.deviceId&&!['default','communications'].includes(d.deviceId))){
      ui.device.add(new Option((d.label||'Microphone '+ui.device.options.length)+(activeInput?.id===d.deviceId?' — active':''),d.deviceId));
    }
    const actual=activeInput?.id;
    if(actual&&!['default','communications'].includes(actual)){
      if(![...ui.device.options].some(o=>o.value===actual))ui.device.add(new Option(activeInput.label+' — active',actual));
      ui.device.value=actual;
    }else if(activeInput){ui.device.options[0].textContent='System default — '+activeInput.label+' — active';ui.device.value='';}
    else if([...ui.device.options].some(o=>o.value===selected))ui.device.value=selected;
    else if(selected){const missing=new Option((previous||'Selected microphone')+' — disconnected',selected);missing.disabled=true;ui.device.add(missing);ui.device.value=selected;}
    showActiveMicrophone();
  }catch{showActiveMicrophone();}
}
async function start(){
  if(pending)return;const token=++attempt,selected=ui.device.value;
  pending=true;setMode('requesting');status('Allow microphone access in your browser.');
  ui.mic.textContent='Cancel microphone';ui.device.disabled=true;showActiveMicrophone();
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'InsecureContext'});
    const AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor)throw Object.assign(new Error(),{name:'AudioUnavailable'});
    context??=new AudioCtor({latencyHint:'interactive'});await context.resume();
    const settings={echoCancellation:true,noiseSuppression:false,autoGainControl:false,channelCount:1};
    if(selected)settings.deviceId={exact:selected};
    const received=await navigator.mediaDevices.getUserMedia({audio:settings,video:false});
    if(token!==attempt||document.hidden){received.getTracks().forEach(t=>t.stop());if(token===attempt)stop('Microphone stopped while this page was in the background.');return;}
    cleanup();stream=received;activeInput=activeMicrophone(stream.getAudioTracks()[0],deviceList);
    const profile=micProfiles.get(activeInput.key)||(!selected&&micProfiles.get('default'))||{sensitivity:50,boost:1};
    gate.sensitivity=profile.sensitivity;micBoost=profile.boost;ui.sens.value=String(gate.sensitivity);$('sensitivity-value').value=ui.sens.value;
    source=context.createMediaStreamSource(stream);inputGain=context.createGain();inputGain.gain.value=micBoost;
    analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.15;analyser.minDecibels=-110;analyser.maxDecibels=-5;
    silent=context.createGain();silent.gain.value=0;source.connect(inputGain);inputGain.connect(analyser);analyser.connect(silent);silent.connect(context.destination);
    pcm=new Float32Array(analyser.fftSize);spectrum=new Float32Array(analyser.frequencyBinCount);
    running=true;pending=false;lastMeasure=0;ui.mic.textContent='Stop microphone';
    stream.getAudioTracks()[0].onended=()=>{stop('Microphone disconnected. Select a mic and start again.');void populateDevices();};
    showActiveMicrophone();beginCalibration();
    // Audio sampling has its own cadence; it does not wait for the next paint.
    micTimer=setInterval(()=>measure(performance.now()),16);
    await populateDevices();if(token!==attempt||!running)return;
    saveMicProfile();
  }catch(e){
    if(token!==attempt)return;pending=false;cleanup();setMode('error');ui.mic.textContent='Try microphone again';
    const messages={NotAllowedError:'Microphone access was blocked. Allow it in the browser’s site settings, then try again.',NotFoundError:'No microphone was found. Connect one, then try again.',NotReadableError:'The microphone could not start. Check your system input settings or another app using it.',OverconstrainedError:'That microphone is no longer available. Choose System default and try again.',InsecureContext:'Microphone access needs HTTPS or localhost. Open this page at its provided link.',AudioUnavailable:'This browser does not support the audio tools needed for this test.'};
    status(messages[e.name]||'The microphone could not start. Check browser and system microphone access, then retry.','error');ui.diag.textContent='Microphone did not start.';
  }
}
ui.mic.addEventListener('click',()=>{if(running||pending)stop();else start();});
ui.recal.addEventListener('click',beginCalibration);
ui.distance.addEventListener('click',calibrateDistance);
ui.device.addEventListener('change',()=>{if(running||pending){stop('Switching microphone…');void start();}else{const profile=micProfiles.get(ui.device.value)||{sensitivity:50,boost:1};gate.sensitivity=profile.sensitivity;micBoost=profile.boost;ui.sens.value=String(gate.sensitivity);$('sensitivity-value').value=ui.sens.value;}});
ui.sens.addEventListener('input',()=>{gate.sensitivity=Number(ui.sens.value);$('sensitivity-value').value=ui.sens.value;saveMicProfile();});
ui.filter.addEventListener('change',()=>gate.filterSpeech=ui.filter.checked);
ui.sound.addEventListener('change',()=>{if(!ui.sound.checked)hush();});
navigator.mediaDevices?.addEventListener('devicechange',()=>void populateDevices());
void populateDevices();
function measure(now){
  if(!running||!analyser)return;const elapsed=lastMeasure?now-lastMeasure:16;if(elapsed<12)return;lastMeasure=now;
  metrics.analysisGapMs=Math.round(elapsed);metrics.maxAnalysisGapMs=Math.max(metrics.maxAnalysisGapMs||0,Math.round(elapsed));
  analyser.getFloatTimeDomainData(pcm);analyser.getFloatFrequencyData(spectrum);const f=audioFeatures(pcm,spectrum,context.sampleRate);
  if(context.state!=='running'){status('Audio is paused. Stop and restart the microphone.');return;}
  if(calibrationEnd){
    noiseSamples.push(f.rms);
    if(now>=calibrationEnd){gate.setNoise(noiseSamples);rawNoise=gate.noise/micBoost;calibrationEnd=0;setMode('ready');ui.recal.disabled=ui.distance.disabled=false;ui.paper.textContent='Ready for your first breath.';status('Ready. Blow gently toward '+activeInput.label+'.');if(gate.noise>.03)status('The room is quite loud. Try a quieter spot, then recalibrate.');}
  }else if(breathCalibrationEnd){
    const sample=breathLevelSample(f,rawNoise,micBoost);if(sample!==null)breathSamples.push(sample);
    if(now>=breathCalibrationEnd){
      const calibrated=calibratedBoost(breathSamples,rawNoise);breathCalibrationEnd=0;setMode('ready');ui.recal.disabled=ui.distance.disabled=false;
      if(calibrated){micBoost=calibrated.boost;inputGain.gain.value=micBoost;gate.setNoise([rawNoise*micBoost]);saveMicProfile();status('Blowing distance set for '+activeInput.label+'. Take a fresh breath.');}
      else{gate.reset();status('No clear breath to calibrate. Check the active microphone and try again from your filming position.');}
      ui.paper.textContent='Ready for your next breath.';
    }
  }else if(geometry.active){gate.reset();metrics.detected=false;}
  else{
    const result=gate.update(f,elapsed,{blocked:now<blockedUntil});metrics.detected=result.active;
    if(result.started){newBubble();setMode('growing');ui.paper.textContent='Keep blowing. Let it grow.';status('Breath-like sound detected · growing','active');}
    if(result.active&&current)growBubble(result.intensity,Math.min(elapsed,80)/1000);
    if(result.ended){releaseBubble();setMode('ready');status('Released. Take another breath.');}
    if(!result.active&&now>=blockedUntil){if(result.voice&&result.loud)status('Voice-like sound · waiting for a breath.');else if(result.candidate)status('Keep blowing…');else status('Ready. Blow gently toward '+activeInput.label+'.');}
  }
  if(now-lastUi>90){
    lastUi=now;const levelDb=db(f.rms/micBoost),thresholdDb=db(gate.threshold()/micBoost),pct=clamp((levelDb+65)/60*100,0,100);
    metrics.levelDb=Math.round(levelDb);metrics.thresholdDb=Math.round(thresholdDb);ui.fill.style.width=pct+'%';ui.fill.style.background=gate.active?'#487b69':'#8eaaa2';ui.marker.style.left=clamp((thresholdDb+65)/60*100,0,100)+'%';ui.level.textContent=Math.round(levelDb)+' dB';document.querySelector('.meter').setAttribute('aria-valuenow',String(Math.round(pct)));
    const boost=Math.round(db(micBoost));
    ui.diag.textContent=calibrationEnd?'Measuring this microphone’s room noise…':breathCalibrationEnd?'Measuring a clear breath at your filming distance…':`Room ${Math.round(db(rawNoise))} dB · trigger ${Math.round(thresholdDb)} dB · input boost +${boost} dB · analysis ${metrics.analysisGapMs} ms`;
  }
}
function bubbleDraw(b,now){
  const selection=b===hover||b===held||b===keyboardSelection?(b===held?'#365957':'#a58486'):null;
  drawBubbleFilm(g,b,now,reduceMotion,selection);
}
function frame(now){
  const dt=Math.min(.045,framePrevious?(now-framePrevious)/1000:0);framePrevious=now;interaction.expire(now);
  if(!geometry.active&&interaction.readyToExplore(now))openGeometry(held);
  geometry.step(dt,now,reduceMotion);g.clearRect(0,0,w,h);const o=origin();
  for(const b of bubbles){
    b.age+=dt;
    if(!geometry.active&&geometry.progress<.01&&b!==held&&b!==keyboardSelection&&b!==interaction.lastTap?.bubble)advanceDrift(b,bubbles,bounds(),dt,reduceMotion);
  }
  // All notebook lenses go below all films, so an overlapping bubble never
  // paints paper over another bubble's rim, highlight or note.
  g.save();g.globalAlpha=1-geometry.progress;
  for(const b of bubbles)drawBubbleLens(g,b,now,reduceMotion);
  if(current)drawBubbleLens(g,current,now,reduceMotion);
  g.restore();
  g.save();g.globalAlpha=1-geometry.progress;g.translate(o.x,o.y);g.rotate(-.13);g.strokeStyle='#737e79';g.lineWidth=1.3;g.beginPath();g.ellipse(0,0,17,6,0,0,Math.PI*2);g.moveTo(0,6);g.lineTo(0,23);g.stroke();g.restore();
  for(const b of bubbles){
    if(b===held)continue;
    g.save();g.globalAlpha=1-geometry.progress;bubbleDraw(b,now);g.restore();
  }
  if(current)bubbleDraw(current,now);
  // The captured bubble stays in front even when a new breath adds another one.
  if(held){g.save();g.globalAlpha=1-geometry.progress;bubbleDraw(held,now);g.restore();}
  geometry.draw(g,w,h,now);
  for(const p of particles){p.age+=dt;const drag=Math.exp(-1.3*dt);p.vx*=drag;p.vy=p.vy*drag-2*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;g.fillStyle=`hsla(${p.h},55%,57%,${Math.pow(Math.max(0,1-p.age/particleLifetime),.7)*.7})`;g.beginPath();g.arc(p.x,p.y,2,0,Math.PI*2);g.fill();}particles=particles.filter(p=>p.age<particleLifetime);
  if(cursor){g.beginPath();g.arc(cursor.x,cursor.y,cursor.closed?5:9,0,Math.PI*2);g.strokeStyle='#365957';g.lineWidth=2;g.stroke();if(cursor.closed){g.fillStyle='#365957';g.fill();}}
  raf=requestAnimationFrame(frame);
}
dimensions();raf=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{stop();hands.dispose();cancelAnimationFrame(raf);context?.close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(running||pending)stop('Microphone stopped while this page was in the background.');if(!['off','error'].includes(hands.state))hands.stop('Camera stopped while this page was in the background.');interaction.cancel();}});
// Read-only diagnostics also make camera-free, repeatable input testing inspectable.
window.bubbleBreath={status:()=>({mode,microphoneActive:running,calibrating:!!(calibrationEnd||breathCalibrationEnd),microphone:activeInput?{label:activeInput.label,deviceId:activeInput.id,boost:micBoost,settings:activeInput.settings}:null,bubblesReleased:total,bubblesOnPage:bubbles.length,bubblesPopped:popped,growing:!!current,radius:current?Math.round(current.r):null,lastNote,sensitivity:gate.sensitivity,speechFilter:gate.filterSpeech,cameraState:hands.state,cameraFramesProcessed:hands.frames,handVisible:!!cursor,heldBubble:held?.id??null,geometry:geometry.status(),positions:bubbles.map(b=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),r:Math.round(b.r),note:b.note.name})),...metrics})};
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'read_breath_test_status',title:'Read breath test status',description:'Read microphone state, detection levels, and the number of released bubbles. Does not start the microphone or access audio.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return window.bubbleBreath.status();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
