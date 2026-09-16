import{BreathGate,audioFeatures,clamp,db}from'./detector.mjs';
import{BubbleInteraction,keepInside}from'./interaction.mjs';
import{CameraHands}from'./hands.mjs';
import{GeometryLens}from'./geometry.mjs';
const $=id=>document.getElementById(id);
const ui={mic:$('mic-button'),recal:$('recalibrate'),status:$('status'),hint:$('hint'),device:$('device'),sens:$('sensitivity'),filter:$('filter'),sound:$('sound'),level:$('level'),fill:$('meter-fill'),marker:$('threshold-marker'),count:$('count'),diag:$('diagnostic'),paper:$('paper-state'),note:$('note-label')};
const canvas=$('scene'),g=canvas.getContext('2d'),gate=new BreathGate();
const notes=[{name:'C5',f:523.25,h:195},{name:'A4',f:440,h:280},{name:'G4',f:392,h:30},{name:'E4',f:329.63,h:140},{name:'D4',f:293.66,h:175},{name:'C4',f:261.63,h:195}];
let context=null,stream=null,source=null,analyser=null,silent=null,pcm=null,spectrum=null;
let running=false,pending=false,attempt=0,calibrationEnd=0,noiseSamples=[],blockedUntil=0,framePrevious=0,lastMeasure=0,lastUi=0;
let w=800,h=390,dpr=1,current=null,bubbles=[],total=0,time=0,lastNote=null,raf=0,metrics={levelDb:null,thresholdDb:null,detected:false},mode='off';
const voices=new Set(),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let bubbleId=0,popped=0,held=null,hover=null,cursor=null,particles=[],pointerActive=false,keyboardSelection=null,inputSource=null;
const geometry=new GeometryLens({onChange:updateGeometryUI});
let grabStarted=0;
function updateGeometryUI(state){
  document.querySelector('.notebook').classList.toggle('geometry-active',state.active);
  for(const id of ['geometry-panel','geometry-scale-wrap','geometry-back'])$(id).hidden=!state.active;
  $('geometry-open').disabled=state.active;$('practice').disabled=state.active;
  $('geometry-scale').value=state.scale;
  for(const key of ['radius','area','volume','pressure'])$('geometry-'+key).textContent=state.ratios[key].toFixed(2)+'×';
  $('geometry-scale-value').textContent=state.scale.toFixed(2)+'×';
  $('geometry-summary').textContent=state.scale===1?'Same radius. Same geometry.':state.scale===2?'Twice the radius. Four times the surface. Eight times the volume.':state.ratios.area.toFixed(2)+'× surface area · '+state.ratios.volume.toFixed(2)+'× volume · '+state.ratios.pressure.toFixed(2)+'× excess pressure.';
}
function openGeometry(b){
  if(!b||geometry.active)return;
  if(current)releaseBubble(false);
  interaction.cancel();keyboardSelection=null;hover=null;grabStarted=0;gate.reset();
  geometry.open(b);status('Geometry view · return to the notebook to blow more bubbles.');
  ui.paper.textContent='The geometry inside your bubble.';
  canvas.setAttribute('aria-label','3D sphere. Drag to rotate. Use the radius slider to compare sizes. Escape returns to bubbles.');
}
function closeGeometry(){
  if(!geometry.active)return;
  geometry.close();interaction.cancel();cursor=null;pointerActive=false;grabStarted=0;blockedUntil=performance.now()+500;
  ui.paper.textContent='Back in your notebook. Your bubbles are still here.';
  status(running?'Ready. Blow gently toward your microphone.':'Start the microphone to make another bubble.');
  canvas.setAttribute('aria-label','Bubble page. Drag to move; hold still to reveal geometry; double-click to pop.');
}
function geometryInput(point,now){
  const c=canvas.getBoundingClientRect(),r=$('geometry-scale').getBoundingClientRect();
  const playScale=point&&!point.closed&&geometry.drag?.mode==='scale';
  geometry.input(point,now,{width:w,height:h,track:{left:r.left-c.left+8,right:r.right-c.left-8,y:r.top-c.top+r.height/2}});
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
const interaction=new BubbleInteraction({pick,onGrab(b){held=b;grabStarted=performance.now();b.vx=b.vy=0;ui.paper.textContent='Hold still to reveal the geometry, or move to drag.';},onMove(b,x,y){b.x=x;b.y=y;keepInside(b,bounds());},onRelease(b){held=null;grabStarted=0;b.vx=b.vy=0;ui.paper.textContent='Released. Two quick pinches will pop it.';},onPop:popBubble});
function handStatus(message){const el=$('hand-status');if(el.textContent!==message)el.textContent=message;$('camera-preview').hidden=!hands.stream;const on=!['off','error'].includes(hands.state);$('camera-button').textContent=on?'Stop hand camera':'Start hand camera';}
const hands=new CameraHands({video:$('hand-video'),onStatus:handStatus,onPoint(point,now){if(pointerActive)return;if(inputSource!=='hand'){interaction.cancel();inputSource='hand';}if(!point){cursor=null;interaction.cancel();geometryInput(null,now);hover=null;return;}const target={x:50+point.x*(w-62),y:50+point.y*(h-85),closed:point.closed};if(cursor){const amount=1-Math.exp(-65/65);target.x=cursor.x+(target.x-cursor.x)*amount;target.y=cursor.y+(target.y-cursor.y)*amount;}cursor=target;if(geometry.active){geometryInput(target,now);handStatus('Pinch to rotate the sphere · pinch along the slider to resize.');return;}interaction.update(target,now);hover=interaction.hover;handStatus(held?'Holding a bubble · open your fingers to release.':hover?'Bubble selected · pinch to grab, double-pinch to pop.':'Hand found · point your index finger at a bubble.');}});
async function ensureAudio(){try{const C=window.AudioContext||window.webkitAudioContext;context??=new C();if(context.state==='suspended')await context.resume();}catch{}}
function popBubble(b){if(!bubbles.includes(b))return;const idx=bubbles.indexOf(b);bubbles.splice(idx,1);held=null;hover=null;if(keyboardSelection===b)keyboardSelection=null;popped++;lastNote=b.note.name;ui.note.textContent=b.note.name;ui.paper.textContent='Pop. '+b.note.name+' floats into a note.';countBubbles();for(let i=0;i<14;i++){const a=i/14*Math.PI*2;particles.push({x:b.x+Math.cos(a)*b.r,y:b.y+Math.sin(a)*b.r,vx:Math.cos(a)*32,vy:Math.sin(a)*32,age:0,h:b.note.h});}if(ui.sound.checked){playNote(b.note.f,b.intensity);blockedUntil=performance.now()+950;}}
$('camera-button').addEventListener('click',()=>{if(!['off','error'].includes(hands.state))hands.stop();else{void ensureAudio();hands.start();}});
$('practice').addEventListener('click',()=>{void ensureAudio();if(bubbles.length>=18){ui.paper.textContent='Pop a bubble to make room for another.';return;}const r=44,b={id:++bubbleId,x:w*.5,y:h*.46,r,volume:r**3,note:noteForRadius(r),vx:0,vy:-4,age:0,seed:Math.random()*10,intensity:.4};bubbles.push(b);keepInside(b,bounds());countBubbles();ui.paper.textContent='Practice bubble. Point, pinch, move, pop.';});
function pointerPoint(e,closed){const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top,closed};}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;void ensureAudio();pointerActive=true;if(inputSource!=='pointer')interaction.cancel();inputSource='pointer';keyboardSelection=null;const p=pointerPoint(e,false);if(geometry.active){geometryInput(p,performance.now());geometryInput({...p,closed:true},performance.now());canvas.setPointerCapture(e.pointerId);return;}interaction.update(p,performance.now());interaction.update({...p,closed:true},performance.now());hover=interaction.hover;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!pointerActive)return;const p=pointerPoint(e,true);if(geometry.active){geometryInput(p,performance.now());return;}interaction.update(p,performance.now());hover=interaction.hover;});
canvas.addEventListener('pointerup',e=>{if(!pointerActive)return;if(geometry.active){geometryInput(pointerPoint(e,false),performance.now());pointerActive=false;return;}interaction.update(pointerPoint(e,false),performance.now());hover=interaction.hover;pointerActive=false;});
for(const type of['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{if(pointerActive){interaction.cancel();geometryInput(null,performance.now());held=null;pointerActive=false;}});
canvas.addEventListener('keydown',e=>{if(geometry.active){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();geometry.yaw+=(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0);geometry.pitch=clamp(geometry.pitch+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0),-1.3,1.3);}return;}if(![' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();void ensureAudio();if(e.key===' '||!bubbles.includes(keyboardSelection)){keyboardSelection=bubbles[(bubbles.indexOf(keyboardSelection)+1)%bubbles.length]||null;hover=keyboardSelection;return;}if(e.key==='Enter'){popBubble(keyboardSelection);return;}const step=e.shiftKey?30:10;keyboardSelection.x+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);keyboardSelection.y+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);keepInside(keyboardSelection,bounds());});
function status(message,kind=''){if(ui.status.textContent!==message)ui.status.textContent=message;ui.status.dataset.kind=kind;}
function setMode(next){mode=next;}
function noteForRadius(radius){const f=523.25*28/Math.max(28,radius);return notes.reduce((a,b)=>Math.abs(Math.log(b.f/f))<Math.abs(Math.log(a.f/f))?b:a);}
function dimensions(){const box=canvas.getBoundingClientRect();w=box.width;h=box.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);bubbles.forEach(b=>keepInside(b,bounds()));}
new ResizeObserver(dimensions).observe(canvas);
function origin(){return{x:w*.5,y:h-58};}
function newBubble(){if(bubbles.length>=18){status('Page full. Pop a bubble to make room.');return;}const o=origin();current={id:++bubbleId,x:o.x,y:o.y-20,r:20,note:notes[0],volume:20**3,vx:0,vy:0,age:0,seed:Math.random()*10,intensity:.2};}
function growBubble(intensity,dt){if(!current)return;current.volume+=dt*(10000+intensity*140000);current.r=Math.min(86,Math.cbrt(current.volume));current.note=noteForRadius(current.r);current.intensity=Math.max(current.intensity,intensity);const o=origin();current.x=o.x;current.y=o.y-current.r+6;ui.note.textContent=current.note.name;}
function releaseBubble(play=true){if(!current)return;const b=current;current=null;b.vx=(Math.random()-.5)*12;b.vy=-14;b.age=0;bubbles.push(b);keepInside(b,bounds());total++;lastNote=b.note.name;countBubbles();if(play&&ui.sound.checked){playNote(b.note.f,b.intensity);blockedUntil=performance.now()+950;}ui.paper.textContent='Your bubble stays here. Grab it or pop a note.';}
function playNote(f,intensity=.4){if(!context||context.state!=='running')return;const t=context.currentTime;const out=context.createGain();out.gain.value=.13+.07*clamp(intensity,0,1);out.connect(context.destination);voices.add(out);[1,2,3.005].forEach((ratio,i)=>{const osc=context.createOscillator(),env=context.createGain();osc.type='sine';osc.frequency.value=f*ratio;env.gain.setValueAtTime(.0001,t);env.gain.exponentialRampToValueAtTime([.65,.14,.025][i],t+.012);env.gain.exponentialRampToValueAtTime(.0001,t+[1.5,.75,.35][i]);osc.connect(env);env.connect(out);osc.start(t);osc.stop(t+1.6);osc.onended=()=>{osc.disconnect();env.disconnect();};});setTimeout(()=>{out.disconnect();voices.delete(out);},1800);}
function hush(){if(context)for(const v of voices)v.gain.setTargetAtTime(0,context.currentTime,.015);}
function beginCalibration(){if(!running)return;if(current)releaseBubble(false);gate.reset();noiseSamples=[];calibrationEnd=performance.now()+2000;blockedUntil=0;hush();setMode('calibrating');status('Stay quiet… measuring the room for two seconds.');ui.paper.textContent='Listening to the room.';ui.recal.disabled=true;}
function cleanup(){running=false;calibrationEnd=0;gate.reset();if(current)releaseBubble(false);if(stream){stream.getTracks().forEach(t=>{t.onended=null;t.stop();});}stream=null;for(const n of[source,analyser,silent]){try{n?.disconnect();}catch{}}source=analyser=silent=null;hush();ui.recal.disabled=true;ui.fill.style.width='0%';ui.level.textContent='— dB';document.querySelector('.meter').setAttribute('aria-valuenow','0');metrics={levelDb:null,thresholdDb:null,detected:false};}
function stop(message='Microphone stopped. Your bubbles can keep floating.'){attempt++;pending=false;cleanup();setMode('off');ui.mic.textContent='Start microphone';status(message);ui.diag.textContent='Microphone is off.';}
async function populateDevices(){try{const selected=ui.device.value;const ds=await navigator.mediaDevices.enumerateDevices();ui.device.replaceChildren(new Option('System default',''));for(const d of ds.filter(x=>x.kind==='audioinput'&&x.deviceId!=='default'&&x.deviceId!=='communications'))ui.device.add(new Option(d.label||'Microphone '+ui.device.options.length,d.deviceId));if([...ui.device.options].some(o=>o.value===selected))ui.device.value=selected;}catch{}}
async function start(){
  if(pending)return;const token=++attempt;pending=true;setMode('requesting');status('Allow microphone access in your browser.');ui.mic.textContent='Cancel microphone';
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'InsecureContext'});
    const AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor)throw Object.assign(new Error(),{name:'AudioUnavailable'});
    context??=new AudioCtor();await context.resume();
    const selected=ui.device.value;const settings={echoCancellation:true,noiseSuppression:false,autoGainControl:false,channelCount:1};if(selected)settings.deviceId={exact:selected};
    const received=await navigator.mediaDevices.getUserMedia({audio:settings,video:false});
    if(token!==attempt){received.getTracks().forEach(t=>t.stop());return;}
    cleanup();stream=received;source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.15;analyser.minDecibels=-110;analyser.maxDecibels=-5;silent=context.createGain();silent.gain.value=0;source.connect(analyser);analyser.connect(silent);silent.connect(context.destination);
    pcm=new Float32Array(analyser.fftSize);spectrum=new Float32Array(analyser.frequencyBinCount);running=true;pending=false;lastMeasure=0;ui.mic.textContent='Stop microphone';stream.getAudioTracks()[0].onended=()=>stop('Microphone disconnected. Select a mic and start again.');await populateDevices();beginCalibration();
  }catch(e){if(token!==attempt)return;pending=false;cleanup();setMode('error');ui.mic.textContent='Try microphone again';const messages={NotAllowedError:'Microphone access was blocked. Allow it in the browser’s site settings, then try again.',NotFoundError:'No microphone was found. Connect one, then try again.',NotReadableError:'The microphone could not start. Check your system input settings or another app using it.',OverconstrainedError:'That microphone is no longer available. Choose System default and try again.',InsecureContext:'Microphone access needs HTTPS or localhost. Open this page at its provided link.',AudioUnavailable:'This browser does not support the audio tools needed for this test.'};status(messages[e.name]||'The microphone could not start. Check browser and system microphone access, then retry.','error');ui.diag.textContent='Microphone did not start.';}
}
ui.mic.addEventListener('click',()=>{if(running||pending)stop();else start();});
ui.recal.addEventListener('click',beginCalibration);
ui.device.addEventListener('change',()=>{if(running){stop('Switching microphone…');start();}});
ui.sens.addEventListener('input',()=>{gate.sensitivity=Number(ui.sens.value);$('sensitivity-value').value=ui.sens.value;});
ui.filter.addEventListener('change',()=>gate.filterSpeech=ui.filter.checked);
ui.sound.addEventListener('change',()=>{if(!ui.sound.checked)hush();});
function measure(now){
  if(!running||!analyser)return;const elapsed=lastMeasure?now-lastMeasure:32;if(elapsed<30)return;lastMeasure=now;
  analyser.getFloatTimeDomainData(pcm);analyser.getFloatFrequencyData(spectrum);const f=audioFeatures(pcm,spectrum,context.sampleRate);
  if(calibrationEnd){noiseSamples.push(f.rms);if(now>=calibrationEnd){gate.setNoise(noiseSamples);calibrationEnd=0;setMode('ready');ui.recal.disabled=false;ui.paper.textContent='Ready for your first breath.';status('Ready. Blow gently toward your microphone.');if(gate.noise>.03){status('The room is quite loud. Try a quieter spot, then recalibrate.');}}}
  else if(geometry.active){gate.reset();metrics.detected=false;}
  else if(context.state!=='running'){status('Audio is paused. Stop and restart the microphone.');}
  else{
    const result=gate.update(f,elapsed,{blocked:now<blockedUntil});metrics.detected=result.active;
    if(result.started){newBubble();setMode('growing');ui.paper.textContent='Keep blowing. Let it grow.';status('Breath-like sound detected · growing','active');}
    if(result.active&&current)growBubble(result.intensity,Math.min(elapsed,80)/1000);
    if(result.ended){releaseBubble();setMode('ready');status('Released. Take another breath.');}
    if(!result.active&&now>=blockedUntil){if(result.voice&&result.loud)status('Voice-like sound · waiting for a breath.');else if(result.candidate)status('Keep blowing…');else status('Ready. Blow gently toward your microphone.');}
  }
  if(now-lastUi>90){lastUi=now;const levelDb=db(f.rms),thresholdDb=db(gate.threshold()),pct=clamp((levelDb+65)/60*100,0,100);metrics.levelDb=Math.round(levelDb);metrics.thresholdDb=Math.round(thresholdDb);ui.fill.style.width=pct+'%';ui.fill.style.background=gate.active?'#487b69':'#8eaaa2';ui.marker.style.left=clamp((thresholdDb+65)/60*100,0,100)+'%';ui.level.textContent=Math.round(levelDb)+' dB';document.querySelector('.meter').setAttribute('aria-valuenow',String(Math.round(pct)));ui.diag.textContent=calibrationEnd?'Measuring room noise…':`Room ${Math.round(db(gate.noise))} dB · trigger ${Math.round(thresholdDb)} dB · ${stream?.getAudioTracks()[0]?.label||'microphone'}`;}
}
function bubbleDraw(b,now,isGrowing=false){
  const r=b.r,x=b.x,y=b.y;g.save();
  const wobble=reduceMotion?0:Math.sin(now*.002+b.seed)*.012;g.translate(x,y);g.scale(1+wobble,1-wobble);
  const fill=g.createRadialGradient(-r*.25,-r*.28,r*.12,0,0,r);fill.addColorStop(0,'rgba(255,255,255,.22)');fill.addColorStop(.72,'rgba(240,246,247,.015)');fill.addColorStop(.94,`hsla(${b.note.h},65%,75%,.11)`);fill.addColorStop(1,'rgba(141,177,187,.13)');g.fillStyle=fill;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
  for(let k=0;k<80;k++){const a=k/80*Math.PI*2,phase=now*.00016+b.seed;const hue=(b.note.h+Math.sin(a*2.3+phase)*95+360)%360;g.beginPath();g.arc(0,0,r,a,a+Math.PI*2/80+.006);g.strokeStyle=`hsla(${hue},68%,${58+Math.sin(a+phase)*12}%,${.24+.32*(.5+.5*Math.sin(a*3+phase))})`;g.lineWidth=1.7+r*.011;g.stroke();}
  g.beginPath();g.arc(0,0,r*.94,3.65,4.85);g.strokeStyle='rgba(255,255,255,.94)';g.lineWidth=2;g.stroke();g.beginPath();g.arc(0,0,r*.88,.45,1.32);g.strokeStyle=`hsla(${b.note.h+70},65%,68%,.22)`;g.lineWidth=1.6;g.stroke();
  if(b===hover||b===held||b===keyboardSelection){g.beginPath();g.arc(0,0,r+7,0,Math.PI*2);g.setLineDash([3,5]);g.strokeStyle=b===held?'#365957':'#a58486';g.lineWidth=1;g.stroke();g.setLineDash([]);}
  g.fillStyle='rgba(64,89,96,.7)';g.font='italic 14px Georgia';g.textAlign='center';g.textBaseline='middle';g.fillText(b.note.name,0,0);g.restore();
}
function frame(now){
  const dt=Math.min(.045,framePrevious?(now-framePrevious)/1000:0);framePrevious=now;time+=dt;interaction.expire(now);
  if(!geometry.active&&held&&grabStarted&&now-grabStarted>700&&interaction.maxTravel<18)openGeometry(held);
  geometry.step(dt,now,reduceMotion);measure(now);g.clearRect(0,0,w,h);const o=origin();
  g.save();g.globalAlpha=1-geometry.progress;g.translate(o.x,o.y);g.rotate(-.13);g.strokeStyle='#737e79';g.lineWidth=1.3;g.beginPath();g.ellipse(0,0,17,6,0,0,Math.PI*2);g.moveTo(0,6);g.lineTo(0,23);g.stroke();g.restore();
  for(const b of bubbles){
    b.age+=dt;
    if(!geometry.active&&geometry.progress<.01&&b!==held&&b!==keyboardSelection&&b!==interaction.lastTap?.bubble){const wind=reduceMotion?0:Math.sin(time*.6+b.seed)*7,vertical=reduceMotion?0:Math.sin(time*.45+b.seed*2)*6;b.vx+=(wind-b.vx)*dt*.7;b.vy+=(vertical-b.vy)*dt*.35;b.x+=b.vx*dt;b.y+=b.vy*dt;keepInside(b,bounds());}
    g.save();g.globalAlpha=1-geometry.progress;bubbleDraw(b,now);g.restore();
  }
  geometry.draw(g,w,h,now);
  for(const p of particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=18*dt;g.fillStyle=`hsla(${p.h},55%,57%,${Math.max(0,1-p.age/.6)*.7})`;g.beginPath();g.arc(p.x,p.y,2,0,Math.PI*2);g.fill();}particles=particles.filter(p=>p.age<.6);
  if(cursor){g.beginPath();g.arc(cursor.x,cursor.y,cursor.closed?5:9,0,Math.PI*2);g.strokeStyle='#365957';g.lineWidth=2;g.stroke();if(cursor.closed){g.fillStyle='#365957';g.fill();}}
  if(current)bubbleDraw(current,now,true);raf=requestAnimationFrame(frame);
}
dimensions();raf=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{stop();hands.dispose();cancelAnimationFrame(raf);context?.close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(running)stop('Microphone stopped while this page was in the background.');if(!['off','error'].includes(hands.state))hands.stop('Camera stopped while this page was in the background.');interaction.cancel();}});
// Read-only diagnostics also make camera-free, repeatable input testing inspectable.
window.bubbleBreath={status:()=>({mode,microphoneActive:running,calibrating:!!calibrationEnd,bubblesReleased:total,bubblesOnPage:bubbles.length,bubblesPopped:popped,growing:!!current,radius:current?Math.round(current.r):null,lastNote,sensitivity:gate.sensitivity,speechFilter:gate.filterSpeech,cameraState:hands.state,cameraFramesProcessed:hands.frames,handVisible:!!cursor,heldBubble:held?.id??null,geometry:geometry.status(),positions:bubbles.map(b=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),r:Math.round(b.r),note:b.note.name})),...metrics})};
if(document.modelContext?.registerTool){const lifecycle=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'read_breath_test_status',title:'Read breath test status',description:'Read microphone state, detection levels, and the number of released bubbles. Does not start the microphone or access audio.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return window.bubbleBreath.status();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
