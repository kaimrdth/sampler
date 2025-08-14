# Web Sampler Drum Machine

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-Enabled-blue)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

A browser-based **sampler drum machine** providing real-time audio sampling, sequencing, and per-sample editing using the Web Audio API — all within the browser.

---

## Features

- **16-pad sampler grid** with randomized pad color schemes per session.
- **Live audio recording** via microphone with per-pad sample storage.
- **Drag-and-drop sample loading** (`.wav` format) directly onto pads.
- **Per-pad ADSR envelope control** (Attack, Decay, Sustain, Release).
- **Pitch and playback rate control** (polyphonic or monophonic).
- **Per-pad filter** (low-pass / high-pass with adjustable frequency & resonance).
- **Sample trimming** via draggable start/end handles with waveform visualization.
- **Step sequencer** (16 steps) with pad-specific patterns.
- **Real-time performance recording** into sequencer patterns.
- **Tempo control** via click-and-drag adjustment.
- **Keyboard mapping** for triggering pads.
- **Responsive UI** with styled transport controls and real-time pad/step highlighting.

---

## Architecture

### Technology Stack
- **HTML** — Application layout and UI structure.
- **CSS** — Dark-themed interface with custom styling for pads, controls, and waveform elements.
- **JavaScript (ES6)** — Core logic for sampling, sequencing, audio processing, and UI interactions.
- **Web Audio API** — Handles audio playback, filtering, ADSR envelopes, and sample trimming.
- **MediaRecorder API** — Captures audio from the microphone for live sampling.

### Core Class
- **`Sampler`**
  - Manages application state, audio context, pad samples, and user interactions.
  - Implements recording, playback, step sequencing, and editing modes.
  - Tracks per-pad sample parameters (ADSR, filter, pitch, trim).
  - Provides event binding for UI controls, keyboard shortcuts, and drag-and-drop.

---

## Audio Signal Flow

```mermaid
flowchart LR
    Mic[Microphone / Audio File] -->|MediaRecorder / decodeAudioData| Buffer[AudioBuffer]
    Buffer --> Source[AudioBufferSourceNode]
    Source --> Filter[BiquadFilterNode]
    Filter --> Gain[GainNode (ADSR Envelope)]
    Gain --> Output[Speakers]