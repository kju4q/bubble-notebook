# the bubble notebook

Try it: [https://bubble-notebook.qendresahhoti.chatgpt.site](https://bubble-notebook.qendresahhoti.chatgpt.site)

I made a geometry notebook you control by blowing into your mic. Bubbles grow with your breath, play a note based on their size, and can be grabbed with your hand in the air. Hold one still and it opens into the math. I built it in Codex with GPT-6 Astra. The sound processing, the hand tracking, and the drawing all run locally in the browser, and the hand model ships with the app. One honest note: the MediaPipe library it uses tries to send anonymous usage telemetry to Google, so the app blocks that request with a content security policy. Your audio and video never leave your machine, and nothing else does either.

## the prompt I started with

"i have this notebook, the kind with the little cubes i used for geometry and math, and i'm seeing bubbles coming from somewhere in the middle of it. as long as i blow, they grow, just like soap bubbles. and depending on the bubble, it hits a note, small ones high, and when it gets bigger the note becomes bolder. more bubbles become kind of a track, like a piano. and they should have their colors, not all over, just those rainbow sides you see when a bubble catches the sun. like a little world on my laptop, i just need help connecting the dots."

That's it, no spec, the spec came from testing.

## the three pieces, and how each actually works

### 1. sound: the mic is a bubble wand

**Getting the sound in.** I use `getUserMedia` with these requested audio constraints and `video: false`:

```js
{
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1
}
```

I want echo cancellation to help with speaker feedback, but I leave noise suppression and automatic gain control off because breath-like noise and its level are the input. These are browser constraints, not a promise that every microphone behaves identically. Choosing a microphone adds `deviceId: {exact: selected}`. Otherwise the browser chooses; the selector reads the opened track to show the active device.

**Reading the signal.** The mic goes through an adjustable gain node into a Web Audio analyser, then through a zero-gain output so I don't hear the live mic. The analyser settings are `fftSize: 2048`, `smoothingTimeConstant: 0.15`, `minDecibels: -110`, and `maxDecibels: -5`. I read floating-point waveform and spectrum data using the audio context's sample rate. Analysis has its own requested **16 ms timer**, independent of drawing; elapsed time per detector update is capped at **80 ms**.

**Deciding what counts as breath.** This is a local heuristic, not a trained breath classifier or an airflow measurement. I use:

- **RMS:** signal level after removing the waveform's mean.
- **Spectral flatness:** how noise-like the spectrum is, calculated over bins from **180 to 7,500 Hz**.
- **Low-frequency fraction:** power below **500 Hz** within the analysed **70 to 7,500 Hz** band.
- **Periodicity:** normalized autocorrelation, used to spot sustained voicing.

The speech filter starts enabled. Voice-like means `periodicity > 0.68 && flatness < 0.2`. Noise-like means `flatness > 0.025 || lowFraction > 0.24 || periodicity < 0.42`. With the filter on, breath must be noise-like and not voice-like, as well as loud enough.

I start with **2 seconds** of quiet-room calibration. The noise estimate is the sorted RMS sample at `floor(sampleCount * 0.65)`, with a floor of **0.00003**. Sensitivity runs from **0 to 100**, default **50**. With `s = sensitivity / 100`, the trigger is:

```js
threshold = max(0.014 - 0.012 * s, noise * (7 - 4.5 * s))
```

I smooth RMS with a **65 ms** time constant. The start gate accumulates **180 ms** of above-threshold, speech-filtered raw RMS evidence while that smoother settles. Failed evidence reduces the accumulated time at **1.7 times** elapsed time. Starting also requires the smoothed level to exceed the threshold. Once active, the level threshold drops to **0.7 times** the start threshold; **280 ms** without a qualifying candidate ends the breath.

For a quiet mic, “set blowing distance” collects an intentional breath during a **3-second** window. It can apply **1× to 8×** input gain, scaling the room-noise estimate with it. Sensitivity and gain are kept separately for each mic during the session.

**Growing the bubble.** I start at radius **20 canvas pixels**. The growth variable is a radius-cubed proxy, not measured air volume:

```js
size = 20 ** 3
size += seconds * (10000 + intensity * 140000)
radius = min(86, cbrt(size))
```

For a qualifying candidate, `intensity = clamp((smoothedRms - threshold * 0.7) / (threshold * 5 + 0.018), 0.12, 1)`; otherwise it is zero. Growth continues while the gate is active, including its release grace, and the displayed radius caps at **86 pixels**.

**Turning size into a note.** On the bubble page, I calculate `targetHz = 523.25 * 28 / max(28, radius)`, then choose the palette note with the smallest `abs(log(noteHz / targetHz))`. Larger bubbles move toward lower notes, with a lower limit set by the palette. This is a musical mapping I chose.

| note | frequency |
| --- | ---: |
| C5 | 523.25 Hz |
| A4 | 440 Hz |
| G4 | 392 Hz |
| E4 | 329.63 Hz |
| D4 | 293.66 Hz |
| C4 | 261.63 Hz |

With sound enabled, a bubble plays its note when the breath gate releases it or when I pop it. I synthesize it with **three sine oscillators**, rather than a piano recording:

| frequency multiplier | peak gain | decay reaches 0.0001 after note start |
| ---: | ---: | ---: |
| 1 | 0.65 | 1.5 seconds |
| 2 | 0.14 | 0.75 seconds |
| 3.005 | 0.025 | 0.35 seconds |

Each envelope starts at **0.0001**, rises exponentially to its peak over **12 ms**, then decays exponentially. The oscillators stop at **1.6 seconds**. Output gain is `0.13 + 0.07 * clamp(intensity, 0, 1)`, using the bubble's stored intensity. After a release or pop note, new breath detection is blocked for **950 ms** to reduce feedback.

**Pitfall:** I test on the actual mic, at the distance I'll use it, and use headphones if the notes trigger bubbles. The speech filter is experimental; passing synthetic checks doesn't prove that my room and mic will behave.

### 2. hands: 21 points, every frame

I use **MediaPipe Tasks Vision's HandLandmarker**, with its JavaScript, WebAssembly files, and `hand_landmarker.task` served alongside the app. Inference runs locally, trying the GPU first and falling back to the CPU if initialization fails. It tracks **one hand**. Detection and presence confidence thresholds are **0.55**; tracking confidence is **0.5**.

I request a front-facing **640 × 480** camera stream with an ideal and maximum frame rate of **30 fps**. Inference follows each fresh decoded video frame through `requestVideoFrameCallback`, with `requestAnimationFrame` as the fallback. That's the scheduling, not a guaranteed inference speed on every laptop.

**The pinch.** I use the thumb tip, landmark **4**, and index tip, landmark **8**. Their distance is divided by the distance from the wrist, **0**, to the middle-finger base, **9**, with a denominator floor of **0.03** in normalized coordinates. The index tip becomes the cursor, mirrored horizontally.

- Below a ratio of **0.38**, the pinch closes.
- Once closed, it stays closed below **0.58**. That gap is the hysteresis.
- While holding a bubble, an ambiguous opening from **0.58 up to, but not including, 0.85** needs another reading at least **30 ms** after the first ambiguous reading. An opening of **0.85 or more** releases immediately.

**Grab, move, release.** An open hand arms the interaction. A pinch picks the frontmost bubble under the cursor, allowing **10 pixels** beyond its radius. I preserve the initial finger-to-centre offset and keep that same bubble captured through overlaps. The held bubble draws in front; opening releases it. Cursor smoothing uses a **12 ms** time constant, and tracking loss lasting more than **250 ms** cancels the grab.

**Double pinch to pop.** Both pinch-and-release gestures must target the same bubble. Each lasts at most **300 ms**, with less than **18 pixels** of travel from its starting point. The second release must happen less than **650 ms** after the first.

**Pitfall:** I show an open hand before pinching, including after tracking is lost, and keep the page foregrounded. Switching away stops the mic and camera.

### 3. physics: hold still and the math opens

I hold a grabbed bubble still for **2 seconds** to open geometry. Moving the cursor more than **12 canvas pixels** from the current stillness anchor moves that anchor and restarts the timer. That leaves room to drag and explore first.

The radius slider runs from **1× to 2×**, in **0.01** steps, and opens at **1.5×**. The values update as I drag. With `k = new radius / original radius`, these are the relationships:

| quantity | formula shown | ratio used | at 2× radius |
| --- | --- | --- | --- |
| surface area | A = 4πr² | k² | 4× |
| volume | V = 4πr³/3 | k³ | 8× |
| excess pressure | ΔP = 4γ/r | 1/k | 0.5× |

The square-cube law is that surface area grows with the square of radius while volume grows with its cube. Pressure here is the ideal soap-bubble comparison at equal surface tension, γ. I show relative values, not a measurement of the bubble's physical size or pressure. Committing a radius change also plays the original bubble's frequency divided by `k`, when sound is on.

I draw the sphere in **Canvas 2D**, projecting rotated points with perspective. The geometry looks like a vintage textbook plate: fine green ink, solid front curves, dashed hidden curves, **two orbital ellipses**, a radius arrow, and formula annotations. Dashed reference constructions mark the original size as the sphere grows. A faint soap-film layer stays underneath the drawing.

## how the build actually went

- I built the notebook piece by piece, testing each on my real mic and webcam as I went. To show what parallel threads look like, I later ran a separate mini-build of sound, hands, and physics as three threads at once, a fresh build of small modules, not a replay of the original session.
- I steered Astra by voice while my hands were busy testing. Voice was how I talked to my coding tool, not a voice-command feature inside the notebook.
- I showed it photos of real soap bubbles when the surface felt fake. The changes were simulated refraction of the notebook lines, a slowly wobbling outline, a shifting rainbow edge, and bubbles scattering across the page with gentle drift instead of heading for one pile. The refraction redraws and bends the notebook grid inside each bubble; it doesn't refract arbitrary camera imagery.
- I moved the controls into a side panel so the notebook could be the hero. The panel starts closed, with small mic and camera buttons always visible.

## build yours, in this order

1. **Start with the prompt in Codex.** I would describe the thing I want to touch and hear before trying to specify every implementation detail.
2. **Build sound first, then test on the real mic.** I would test quiet, blowing, ordinary speech, stopping, and switching inputs. Serve the page over localhost or HTTPS for mic access.
3. **Add hands, then test on the real webcam.** I would check open-hand arming, pinch, drag, release, overlapping bubbles, and double pinch. Keep the hand model and its runtime files with the app.
4. **Add geometry and check the ratios by hand.** I would double the radius and verify 4× area, 8× volume, and half the excess pressure before polishing the drawing.
5. **Show it a photo when the visuals feel fake.** I would point to the exact things missing, like bent notebook lines, a flexible outline, or colour living on the edge.
6. **Hide the controls last.** I would get the interactions working, then fold the controls away and leave the mic and camera one click away.

## run it locally

Clone the repo, then serve it from the project root:

```sh
git clone https://github.com/kju4q/bubble-notebook.git
cd bubble-notebook
python3 -m http.server 4173 --bind 127.0.0.1 --directory .
```

Open [http://127.0.0.1:4173/dist/](http://127.0.0.1:4173/dist/).

Built by @kju4q, more at github.com/kju4q
