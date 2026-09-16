# Bubble Notebook — breath, hands & geometry feasibility prototype

A small browser experiment: blow to grow a bubble, let it drift inside a notebook page, pinch to grab and move it, and double-pinch to pop a synthesized note.

## Try it

1. Add a practice bubble, then start the hand camera and allow camera access. Initial hand-tracker loading can take a few seconds.
2. Show an open hand. A mirrored cursor follows your index fingertip; a dashed ring marks the selected bubble.
3. Pinch thumb and index finger together over a bubble. Hold the pinch while moving, then open to release.
4. Pinch and open twice quickly over the same bubble to pop it. Each pinch should be shorter than 300 ms, with the releases less than 650 ms apart. A drag does not count as a pop.
5. Start microphone, stay quiet for the two-second calibration, then blow gently for 1–3 seconds. Stop to release the bubble. The established microphone interaction is preserved.

Pointer fallback: drag a bubble, or double-click it to pop. Keyboard: focus the bubble canvas, Space selects/cycles, arrows move, Enter pops. Bubbles stay on the page until popped or the page is refreshed. This version does not save pages.

Camera and microphone tracks stop when switched off or when the page goes into the background. Input is processed locally, with no recording or upload. Camera and microphone are enabled separately. The tune panel contains microphone selection, sensitivity, level and threshold diagnostics. Headphones can reduce feedback from the notes.

## Implementation and limits

The microphone detector uses room-relative energy, sustained-input timing, spectral characteristics, and periodicity. It detects breath-like noise, not airflow. Unvoiced speech, wind, or music may still cause false triggers. The user confirmed real blowing worked on the earlier microphone version; the user also confirmed that the hand interaction worked in the subsequent live test. The new geometry reveal still needs their own hand test.

Local MediaPipe Tasks Vision 1.0.1 provides hand landmarks. The model, JavaScript, and WebAssembly are self-hosted. See `dist/vendor/mediapipe/THIRD_PARTY.md` for sources, integrity information, and the license. Codex/Astra builds the application; MediaPipe supplies runtime hand landmarks. There are no OpenAI API calls in this prototype.

Gesture control uses normalized thumb–index distance, separate closing/opening thresholds, smoothed cursor positions, an open-hand arming step, and release on tracking loss. A held pinch moves a bubble; two short stationary pinches pop one. Motion and iridescence are visual approximations, not a soap-film simulation. Musical pitch is a designed inverse-radius mapping to a C-major pentatonic scale. Sound is synthesized with decaying partials, not sampled piano. Physics junctions, deformable films, hand drawing, musical sequencing, and saved notebook pages are outside this small test.

## Verification — September 16, 2026

`node --test tests/*.test.mjs`: 19 tests passed, covering breath detection and the hand/pointer state machine, including dragging without popping, double-pinches, different targets, tracking loss, pinch hysteresis, and page boundaries.

Serve the project root on localhost to access the browser fixtures. These are outside the deployed `dist/` folder:

- `/tests/hands-browser.html`: eight checks passed. A practice bubble appears; dragging clamps to the page; double-click pops once and selects a note; the actual bundled model loads and processes generated video; a blank scene produces no hand; stopping ends the track; denied permission displays recovery guidance; cancelling a pending request stops a late-arriving stream. These use generated video and scripted pointer input, not a physical hand.
- `/tests/browser.html`: eight microphone regression checks passed. Calibration and silence behavior; sustained generated noise begins growth and grows radius from 45 to 64 pixels; silence releases one C4 bubble; a 220 Hz tone is rejected; stopping ends input tracks; denied permission displays guidance.

These checks do not establish real-world hand-tracking or breath/speech accuracy. That is the purpose of the user's next live test.

## Local development

No install or build is required. Serve `dist/` over localhost, for example `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`. Camera and microphone require HTTPS or localhost.

## Final feasibility slice: geometry reveal

Hold a grabbed bubble nearly still for 700 ms (less than 18 px movement) to open the geometry view. A quick drag still moves a bubble, and double-pinching still pops it. The notebook transitions to a flat geometry sheet; the bubble moves into a 3D wireframe with front/back depth shading. Open your fingers after entering, then pinch to rotate. Pinch along the radius slider to resize. Pointer and keyboard controls also work, and Explore geometry provides direct entry. Back to bubbles or Escape returns to the original page without modifying the original bubble.

The sphere is generated from parametric 3D points, rotated in three dimensions and rendered with orthographic projection in Canvas. It uses the original bubble's color and note. The original radius remains as a dashed reference when enlarged. No new rendering dependency or model API was introduced.

Comparison uses normalized radius, not a physical measurement from the microphone: area ratio s², volume ratio s³, excess-pressure ratio 1/s at equal constant surface tension. Doubling the radius therefore displays 4× area, 8× volume, and 0.5× excess pressure. Sound is a designed inverse-radius mapping; at 2× radius the selected note's frequency halves. It is not an acoustic model of a soap bubble. The mathematical model describes ideal spheres, not a fluid simulation.

References: https://labs.phys.utk.edu/mbreinig/phys221core/modules/m7/surface_tension.html and https://annex.exploratorium.edu/ronh/bubbles/shape_of_bubbles.html

Additional verification: three geometry unit tests check ratios, radius preservation under rotation, and input/return behavior without mutating the source. The browser fixture `/tests/geometry-browser.html` passed eight checks: hold to enter; drag to rotate; exact double-size readouts; reset; original bubble preserved after return; double-click still pops; camera-free entry; Escape exit. All browser input in that fixture is scripted; live physical hand feel remains for the user to assess. Reduced-motion preferences bypass the transition and automatic rotation.
