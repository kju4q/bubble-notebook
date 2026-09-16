# Bubble Notebook — breath feasibility prototype

A small browser experiment: microphone input → growing bubble → release → drifting bubble and synthesized note. No API, account-specific data, external scripts, audio recording, or audio upload in the application.

## Try it

1. Open the private deployed link, or serve `dist/` over localhost.
2. Start microphone and allow access. Stay quiet for the two-second room calibration.
3. Blow gently toward the selected microphone for 1–3 seconds. Stop to release the bubble.
4. Compare a short and longer breath. Longer/larger bubbles should produce lower notes.
5. Talk normally and check for unwanted triggers. Adjust sensitivity or the experimental speech filter if necessary. Recalibrate after changing the microphone or room.

The tune panel includes input selection, live level and threshold diagnostics. Headphones can reduce the chance of speaker notes triggering the mic. Switching away from the page stops microphone capture. No camera is requested.

## What this establishes

The browser interaction and synthetic signal pipeline have been tested. Human blowing on the user's actual microphone is still to be tested. The detector uses room-relative energy, sustained-input timing, spectral characteristics, and periodicity. It detects breath-like noise, not airflow. Sustained unvoiced speech, environmental wind, or music can produce false triggers. Realistic soap-film physics, Plateau junctions, hand input, and saved notebook pages are not included.

Bubble drift and iridescence are visual approximations. Musical pitch is a designed inverse-radius mapping quantized to a C-major pentatonic scale. The sound is synthesized with decaying partials, not sampled piano.

## Verification

`node --test tests/detector.test.mjs` — 7 tests passed: quiet input, sustained growth/release events, transient rejection, voiced-tone rejection, speaker cooldown, calibration/sensitivity, and actual waveform feature extraction.

For browser integration, serve this project root on localhost and open `/tests/browser.html`. Its clearly labeled generated stream replaces the microphone only inside the isolated test iframe. Eight checks passed on September 16, 2026: calibration; quiet produces no bubbles; generated sustained noise begins growth; continued input grows radius from 37 to 60 pixels; silence releases one C4 bubble; a 220 Hz tone is rejected; stopping ends the input tracks; permission denial displays recovery guidance. These checks do not establish real-world breath/speech accuracy.

The main screen was inspected in the local browser. The read-only WebMCP status tool was validated with valid and invalid input. The production static folder excludes the test fixture.

## Local development

No installation or build needed. Serve `dist/` with an HTTP server, for example `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`. Microphone access requires HTTPS or localhost.
