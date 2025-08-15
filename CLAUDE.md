# Web Sampler Drum Machine - CLAUDE.md

## Overview
A browser-based 16-pad sampler drum machine built with vanilla HTML, CSS, and JavaScript. Features real-time audio sampling, sequencing, and comprehensive per-sample editing using the Web Audio API.

## Project Structure
- `index.html` - Main application interface with transport controls, pad grid, sequencer, and edit sections
- `script.js` - Core application logic in `PO33Sampler` class
- `style.css` - Complete styling for dark-themed interface
- `README.md` - Comprehensive documentation with features and architecture

## Key Technologies
- **Web Audio API** - Audio playback, filtering, ADSR envelopes, sample processing
- **MediaRecorder API** - Live microphone recording for sampling
- **Canvas API** - Waveform visualization and editing interface
- **Vanilla JavaScript ES6** - No external dependencies

## Core Class: PO33Sampler

### Main Properties
- `samples[16]` - AudioBuffer array storing loaded/recorded samples
- `sampleParams[16]` - Per-pad parameters (ADSR, filter, pitch, volume, trim)
- `sequencePatterns[4][16][16]` - 4 banks of 16-step sequences for 16 pads
- `offGridNotes[4][16][]` - Off-grid timing for performance recording
- `waveformZoom[16]` - Per-pad zoom/pan state for waveform editing

### Key Features Implementation

#### Audio Sampling & Playback (`script.js:450-722`)
- `startRecording()` - MediaRecorder-based live sampling
- `playSampleWithEffects()` - Full audio chain with ADSR, filters, effects
- Mono/poly modes, looping, trim start/end support

#### Step Sequencer (`script.js:774-866`) 
- 16-step grid with 4 pattern banks
- Speed multipliers (1x, 2x, 4x) for subdivision control
- Global and per-pad swing timing
- Real-time pattern recording in write mode

#### Sample Editing (`script.js:924-1447`)
- Waveform visualization with zoom/pan controls
- Draggable trim handles for start/end points
- ADSR envelope control with radial knobs
- Filter controls (lowpass/highpass with freq/resonance)
- Volume, pitch, and swing per-pad parameters

#### UI Controls
- Radial knob controls with mouse/touch drag support (`script.js:1786-2046`)
- Tempo adjustment via click-drag interface (`script.js:1675-1784`)
- Keyboard shortcuts for pad triggering and waveform editing
- Drag & drop support for loading .wav files (`script.js:1563-1674`)

## File Structure & Organization

### Transport Controls (`index.html:23-60`)
- Metronome, Record, Write, Play, Sequencer, Edit mode buttons
- Tempo display with click-drag adjustment
- Global swing control

### Pad Grid (`index.html:63-160`)
- 16 pads with randomized color schemes
- Individual mute/solo controls per pad
- Visual feedback for active, recording, and sample-loaded states

### Sequencer Interface (`index.html:162-208`)
- 16-step grid for pattern programming
- Bank selection (A/B/C/D) with pattern indicators
- Speed multiplier controls (1x/2x/4x)
- Pattern clear functionality

### Edit Panel (`index.html:210-385`)
- ADSR envelope controls (Attack, Decay, Sustain, Release)
- Volume and pitch controls
- Filter section (type, frequency, resonance)
- Waveform visualizer with zoom controls
- Trim handles for sample start/end editing
- Loop/One-shot mode toggles

## Key Algorithms

### Audio Signal Chain
```
Microphone/File → AudioBuffer → AudioBufferSourceNode → 
BiquadFilterNode → GainNode (ADSR) → Destination
```

### Timing & Sequencing
- Base timing: 16th notes at current BPM
- Speed multipliers create subdivisions (32nd, 64th notes)
- Swing applies timing offset to off-beat steps
- Off-grid recording captures precise timing for humanization

### Waveform Editing
- Multi-resolution rendering based on zoom level (`script.js:1124-1194`)
- Zero-crossing detection for clean edit points (`script.js:1426-1447`)
- Real-time trim preview with visual overlay

## Development Notes

### Audio Context Management
- Handles suspended state and user gesture requirements
- Automatic resume on user interaction
- Proper cleanup of audio sources to prevent memory leaks

### Mobile Optimization
- Touch event support throughout interface
- Haptic feedback where available
- Responsive controls for smaller screens
- Mobile-friendly gesture sensitivity adjustments

### Performance Considerations
- Efficient waveform rendering with sample-accurate display
- Audio source pooling for mono mode
- Memory cleanup for replaced samples
- Real-time audio processing without glitches

## Testing & Usage

### Browser Compatibility
Requires modern browser with:
- Web Audio API support
- MediaRecorder API for live sampling
- getUserMedia for microphone access

### Basic Usage Flow
1. Grant microphone permissions
2. Press Record button → tap pad to sample
3. Use Play button to start/stop sequencer
4. Enter Sequencer mode to program patterns
5. Use Edit mode for per-sample parameter control

### Keyboard Shortcuts
- `1-4, q-r, a-f, z-v` - Trigger pads 1-16
- `Space` - Play/stop sequencer
- `Arrow keys` (in edit mode) - Navigate/edit waveform
- `Shift + arrows` - Fine trim adjustment
- `0` - Reset waveform zoom

## Architecture Strengths
- Clean separation between audio engine and UI
- Modular design with clear responsibility boundaries
- No external dependencies for maximum compatibility
- Real-time performance optimized
- Comprehensive feature set rivaling hardware samplers