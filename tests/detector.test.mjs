import test from 'node:test';
import assert from 'node:assert/strict';
import {BreathGate,audioFeatures} from '../dist/detector.mjs';
const quiet={rms:.001,flatness:.6,lowFraction:.1,periodicity:.1};
const breath={rms:.09,flatness:.35,lowFraction:.4,periodicity:.18};
const voice={rms:.09,flatness:.005,lowFraction:.4,periodicity:.94};
function feed(g,f,ms,options){let starts=0,ends=0,r;for(let t=0;t<ms;t+=32){r=g.update(f,32,options);starts+=+r.started;ends+=+r.ended;}return{starts,ends,r};}
test('calibrated room noise does not grow bubbles',()=>{const g=new BreathGate();g.setNoise(Array(64).fill(.001));assert.equal(feed(g,quiet,4000).starts,0);});
test('sustained noise starts once, holds, and silence releases once',()=>{const g=new BreathGate();assert.equal(feed(g,breath,1500).starts,1);assert.equal(g.active,true);assert.equal(feed(g,breath,1000).starts,0);assert.equal(feed(g,quiet,1000).ends,1);assert.equal(g.active,false);assert.equal(feed(g,quiet,1000).ends,0);});
test('short impact does not start a bubble',()=>{const g=new BreathGate();assert.equal(feed(g,breath,64).starts,0);assert.equal(feed(g,quiet,1000).starts,0);});
test('sustained strongly voiced tone is rejected with speech filter',()=>{const g=new BreathGate();assert.equal(feed(g,voice,3000).starts,0);g.filterSpeech=false;assert.equal(feed(g,voice,1000).starts,1);});
test('note cooldown cannot start a bubble',()=>{const g=new BreathGate();assert.equal(feed(g,breath,2000,{blocked:true}).starts,0);assert.equal(feed(g,breath,1000).starts,1);});
test('calibration resets active state and sensitivity lowers threshold',()=>{const g=new BreathGate();feed(g,breath,1000);g.setNoise([.001,.001,.001,.5]);assert.equal(g.active,false);assert.equal(g.noise,.001);g.sensitivity=10;const low=g.threshold();g.sensitivity=90;assert.ok(g.threshold()<low);});
test('waveform features distinguish sine periodicity from seeded broadband noise',()=>{const n=2048,sr=48000,tone=new Float32Array(n),noise=new Float32Array(n);let seed=937;for(let i=0;i<n;i++){tone[i]=.1*Math.sin(2*Math.PI*220*i/sr);seed=(seed*1664525+1013904223)>>>0;noise[i]=.17*(seed/4294967296-.5);}const spectrum=new Float32Array(1024).fill(-40);const a=audioFeatures(tone,spectrum,sr),b=audioFeatures(noise,spectrum,sr);assert.ok(a.periodicity>.9);assert.ok(b.periodicity<.4);assert.ok(Number.isFinite(b.rms));});
