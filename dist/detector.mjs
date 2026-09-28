export const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const db=(n)=>20*Math.log10(Math.max(n,1e-7));
export function soundCharacter(f){
  return {voice:f.periodicity>.68&&f.flatness<.2,
    noiseLike:f.flatness>.025||f.lowFraction>.24||f.periodicity<.42};
}

// Local signal heuristics, not a trained classifier or an airflow measurement.
export function audioFeatures(samples,spectrum,sampleRate){
  let sum=0,peak=0,mean=0;
  for(const x of samples)mean+=x;
  mean/=samples.length;
  for(const raw of samples){const x=raw-mean;sum+=x*x;peak=Math.max(peak,Math.abs(x));}
  const rms=Math.sqrt(sum/samples.length);
  let power=0,low=0,logPower=0,bandSum=0,bandN=0;
  const hzPerBin=sampleRate/(2*spectrum.length);
  for(let i=1;i<spectrum.length;i++){
    const hz=i*hzPerBin;if(hz<70||hz>7500)continue;
    const p=Math.pow(10,Math.max(-120,spectrum[i])/10);power+=p;
    if(hz<500)low+=p;
    if(hz>=180){logPower+=Math.log(p+1e-14);bandSum+=p;bandN++;}
  }
  const flatness=bandN?Math.exp(logPower/bandN)/(bandSum/bandN+1e-14):0;
  // Normalized autocorrelation estimates sustained voicing. Downsample for cost.
  let periodicity=0;
  // Quiet built-in microphones still need voicing checks during gain calibration.
  if(rms>.00003){
    const stride=3,n=Math.min(320,Math.floor(samples.length/stride)),minLag=Math.max(8,Math.floor(sampleRate/stride/450)),maxLag=Math.min(n-100,Math.floor(sampleRate/stride/85));
    for(let lag=minLag;lag<=maxLag;lag+=2){let cross=0,a=0,b=0;
      for(let j=0;j<n-lag;j++){const x=samples[j*stride]-mean,y=samples[(j+lag)*stride]-mean;cross+=x*y;a+=x*x;b+=y*y;}
      periodicity=Math.max(periodicity,cross/(Math.sqrt(a*b)+1e-12));
    }
  }
  return{rms,peak,flatness:clamp(flatness,0,1),lowFraction:low/(power+1e-14),periodicity,crest:peak/(rms+1e-8)};
}

export class BreathGate{
  constructor(){this.noise=.002;this.sensitivity=50;this.filterSpeech=true;this.reset();}
  reset(){this.active=false;this.onMs=0;this.offMs=0;this.smooth=0;this.activeMs=0;}
  threshold(){const s=this.sensitivity/100;return Math.max(.014-.012*s,this.noise*(7-4.5*s));}
  setNoise(values){const ordered=values.filter(Number.isFinite).sort((a,b)=>a-b);this.noise=ordered.length?Math.max(.00003,ordered[Math.floor(ordered.length*.65)]):.002;this.reset();}
  update(f,dt,{blocked=false}={}){
    dt=clamp(dt,0,80);const threshold=this.threshold();
    this.smooth+=(f.rms-this.smooth)*(1-Math.exp(-dt/65));
    const loud=this.smooth>threshold*(this.active?.7:1);
    const {voice,noiseLike}=soundCharacter(f);
    const candidate=!blocked&&loud&&(!this.filterSpeech||(!voice&&noiseLike));
    // Accumulate the same 180 ms of above-threshold, speech-filtered evidence
    // while the 65 ms smoother settles, instead of putting the two waits in series.
    // Starting still requires BOTH sustained evidence and smoothed level > threshold.
    const attackCandidate=!blocked&&f.rms>threshold&&(!this.filterSpeech||(!voice&&noiseLike));
    let started=false,ended=false;
    if(!this.active){this.onMs=attackCandidate?this.onMs+dt:Math.max(0,this.onMs-dt*1.7);if(this.onMs>=180&&candidate){this.active=true;started=true;this.activeMs=0;this.offMs=0;}}
    else {this.activeMs+=dt;this.offMs=candidate?0:this.offMs+dt;if(this.offMs>=280){this.active=false;ended=true;this.onMs=0;this.offMs=0;}}
    const intensity=candidate?clamp((this.smooth-threshold*.7)/(threshold*5+.018),.12,1):0;
    return{active:this.active,started,ended,candidate,voice,loud,intensity,threshold,level:this.smooth};
  }
}
