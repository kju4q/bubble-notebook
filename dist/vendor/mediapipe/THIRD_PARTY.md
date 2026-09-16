# Local hand-tracking dependencies

MediaPipe Tasks Vision 1.0.1 from Google, licensed under Apache 2.0.
The license and dependency notices are preserved in `LICENSE`.

- Package: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1
- Download: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.0.1.tgz
- npm integrity (verified before extraction): sha512-rvRE2FmAZ6ZxKSw7wq+e+jQDpN3t1B/tD2mJz9SmAzb1msoDkd4dMoE4wAh8Z30Um0PQwLiHr9QtomhmXk3aUQ==
- Source: https://github.com/google-ai-edge/mediapipe
- Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Model: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
- Model SHA-256: fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1

These runtime files and the model are served with the application. Inference runs locally; camera frames are not sent to a model API. Codex/Astra is the build tool; MediaPipe provides the runtime hand landmarks.
