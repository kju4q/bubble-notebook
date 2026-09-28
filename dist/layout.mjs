// Presentation only: quick controls forward to the original controls, and
// notifications observe their existing text. No audio, tracking or scene state.
const $=id=>document.getElementById(id);
const panel=$('tools-panel'),toggle=$('tools-toggle');
$('dismiss-device-note').addEventListener('click',()=>{$('small-screen-note').hidden=true;$('quick-mic').focus({preventScroll:true});});
function setPanel(open,restoreFocus=false){
  panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
  if(restoreFocus)toggle.focus();
}
toggle.addEventListener('click',()=>setPanel(panel.hidden));
$('tools-close').addEventListener('click',()=>setPanel(false,true));
document.addEventListener('pointerdown',event=>{
  if(!panel.hidden&&!panel.contains(event.target)&&!event.target.closest('.page-tools'))setPanel(false);
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(!panel.hidden){
    event.preventDefault();event.stopImmediatePropagation();setPanel(false,true);
  }else if(!$('geometry-back').hidden){
    // The original Escape handler closes the study; its old focus target now
    // lives in the folded panel, so return keyboard access to the page.
    queueMicrotask(()=>{if($('geometry-back').hidden)$('scene').focus({preventScroll:true});});
  }
},true);
for(const [quickId,originalId] of [['quick-mic','mic-button'],['quick-camera','camera-button']]){
  const quick=$(quickId),original=$(originalId);
  const sync=()=>{
    const label=original.textContent.trim(),active=/^(Stop|Cancel)/.test(label);
    if(quick.getAttribute('aria-label')!==label){
      quick.setAttribute('aria-label',label);quick.setAttribute('title',label);
      quick.querySelector('.tool-tip').textContent=label;
    }
    if(quick.getAttribute('aria-pressed')!==String(active))quick.setAttribute('aria-pressed',String(active));
    quick.disabled=original.disabled;
    if(originalId==='mic-button')panel.dataset.micActive=String(active);
  };
  quick.addEventListener('click',()=>original.click());
  new MutationObserver(sync).observe(original,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['disabled']});sync();
}
for(const id of ['practice','geometry-open'])$(id).addEventListener('click',()=>{
  setPanel(false);$('scene').focus({preventScroll:true});
});
$('geometry-back').addEventListener('click',()=>$('scene').focus({preventScroll:true}));
const toast=$('moment-toast'),timers=new Map();
function clearMoment(source){
  clearTimeout(timers.get(source));timers.delete(source);
  toast.querySelector(`[data-source="${source}"]`)?.remove();toast.hidden=!toast.children.length;
}
function showMoment(message,source,error=false,persistent=false){
  let line=toast.querySelector(`[data-source="${source}"]`);
  if(!line){line=document.createElement('p');line.dataset.source=source;toast.append(line);}
  line.textContent=message;line.classList.toggle('toast-error',error);toast.hidden=false;
  clearTimeout(timers.get(source));
  timers.delete(source);
  if(!persistent)timers.set(source,setTimeout(()=>clearMoment(source),error?8500:5500));
}
const firstRunHints=[
  'start the mic to grow your first bubble.',
  'blow gently, then stop to release your bubble.',
  'start the camera to move bubbles with your hand.',
  'show an open hand, then pinch a bubble to grab it.',
  'move to drag. open your fingers to let go. hold still for 2 seconds to open the math.',
  'two quick pinches on a bubble pop it.'
];
let hintStep=-1;
function advanceHint(step){
  if(step<=hintStep)return;
  hintStep=step;showMoment(firstRunHints[step],'first-run');
}
advanceHint(0);
// Each action advances once per page visit; status observers own separate lines.
document.addEventListener('notebook-action',({detail})=>{
  if(detail==='geometry'){hintStep=firstRunHints.length;clearMoment('first-run');return;}
  if(detail==='bubble-released')advanceHint(2);
  if(detail==='grab')advanceHint(4);
  if(detail==='release'&&hintStep===4)advanceHint(5);
});
$('practice').addEventListener('click',()=>advanceHint(2));
$('mic-button').addEventListener('click',()=>{if(hintStep<=1)clearMoment('first-run');});
$('camera-button').addEventListener('click',()=>{if(hintStep<=3)clearMoment('first-run');});
let awaitingCalibration=false;
const micStatus=$('status');let lastMic=micStatus.textContent;
new MutationObserver(()=>{
  const message=micStatus.textContent;if(message===lastMic)return;lastMic=message;
  if(micStatus.dataset.kind==='active'||/microphone stopped|switching microphone/i.test(message)){clearMoment('microphone');awaitingCalibration=false;return;}
  const calibration=/stay quiet|blow gently for two seconds/i.test(message);
  const completed=awaitingCalibration&&/^Ready\./.test(message);
  const error=micStatus.dataset.kind==='error'||/disconnected|could not|no clear breath|quite loud|audio is paused/i.test(message);
  if(completed&&hintStep===0){clearMoment('microphone');advanceHint(1);}
  else if(calibration||completed||error||/allow microphone|blowing distance set|page full/i.test(message))showMoment(message,'microphone',error);
  if(calibration)awaitingCalibration=true;
  if(completed||error||/blowing distance set|microphone stopped/i.test(message))awaitingCalibration=false;
}).observe(micStatus,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-kind']});
const cameraStatus=$('hand-status');let lastCamera=cameraStatus.textContent;
new MutationObserver(()=>{
  const message=cameraStatus.textContent;if(message===lastCamera)return;lastCamera=message;
  if(/^loading hand tracking/i.test(message)){showMoment('loading hand tracking, first start downloads about 20 MB.','camera',false,true);return;}
  if(/show an open hand\. your fingertip|hand found|holding a bubble|bubble selected/i.test(message))advanceHint(3);
  if(/show an open hand\. your fingertip/i.test(message)){clearMoment('camera');return;}
  if(/camera is off|camera stopped|hand found|holding a bubble|bubble selected/i.test(message)){clearMoment('camera');return;}
  const error=/blocked|could not|no camera|disconnected|paused|requires HTTPS/i.test(message);
  if(error||/allow camera|loading hand|show an open hand\. your fingertip/i.test(message))showMoment(message,'camera',error);
}).observe(cameraStatus,{childList:true,characterData:true,subtree:true});
