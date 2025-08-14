class PO33Sampler {
    constructor() {
        this.audioContext = null;
        this.mediaRecorder = null;
        this.stream = null;
        this.samples = new Array(16).fill(null);
        this.isRecording = false;
        this.recordingPad = null;
        this.recordMode = false;
        this.writeMode = false;
        this.isSequencerMode = false;
        this.isSequencerPlaying = false;
        this.isEditMode = false;
        this.editingPad = 0;
        this.currentStep = 0;
        this.sequencePatterns = new Array(16).fill(null).map(() => new Array(16).fill(false));
        this.selectedPad = 0;
        this.tempo = 120;
        this.stepInterval = null;
        this.isRealtimeRecording = false;
        
        // Track active audio sources for mono mode
        this.activeSources = new Array(16).fill(null);
        
        // Mute and Solo states
        this.mutedPads = new Array(16).fill(false);
        this.soloedPads = new Array(16).fill(false);
        
        // Pad colors (randomized on each load)
        this.padColors = this.generateRandomPadColors();
        
        // Sample edit parameters (per pad)
        this.sampleParams = new Array(16).fill(null).map(() => ({
            attack: 0.01,
            decay: 7.0,
            sustain: 0.8,
            release: 8.0,
            pitch: 1.0,
            filterType: 'lowpass',
            filterFreq: 8000,
            filterRes: 1,
            trimStart: 0.0,  // Start position (0-1)
            trimEnd: 1.0,    // End position (0-1)
            polyMode: 'poly' // 'poly' or 'mono'
        }));
        
        this.initializeAudio();
        this.setupEventListeners();
        this.updateTempo();
        this.applyPadColors();
        this.setupMuteSoloControls();
    }

    generateRandomPadColors() {
        const colors = [
            '#8B4F9B',  // purple
            '#4A9BB8',  // cyan
            '#C76B47',  // burnt orange
            '#B85C9E',  // magenta
            '#6B8B47',  // olive green
            '#4F6B8B',  // steel blue
            '#8B4F6B',  // burgundy
            '#4F8B6B',  // teal
            '#6B4F8B',  // indigo
            '#4A7D9B',  // ocean blue
            '#9B4F7D',  // plum
            '#7D9B4A',  // lime
            '#B84A7D',  // raspberry
            '#9B4F4F',  // crimson
            '#4F9B7D',  // mint
            '#7D4F9B'   // violet
        ];
        
        // Shuffle the colors array
        const shuffled = [...colors];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        return shuffled;
    }

    applyPadColors() {
        document.querySelectorAll('.pad').forEach((pad, index) => {
            const color = this.padColors[index];
            pad.style.setProperty('--pad-color', color);
            pad.style.setProperty('--pad-color-light', color + '33'); // 20% opacity
            pad.style.setProperty('--pad-color-lighter', color + '1A'); // 10% opacity
        });
    }

    async initializeAudio() {
        try {
            if (!window.AudioContext && !window.webkitAudioContext) {
                throw new Error('Web Audio API not supported');
            }
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia not supported');
            }
            
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
        } catch (error) {
            console.error('Error accessing microphone:', error);
            const status = document.getElementById('recording-status');
            if (error.name === 'NotAllowedError') {
                status.textContent = 'Microphone access denied. Please allow microphone access.';
            } else if (error.name === 'NotFoundError') {
                status.textContent = 'No microphone found.';
            } else {
                status.textContent = 'Audio not supported in this browser.';
            }
        }
    }

    setupEventListeners() {
        document.getElementById('record-btn').addEventListener('click', () => this.toggleRecord());
        document.getElementById('write-btn').addEventListener('click', () => this.toggleWrite());
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlay());
        document.getElementById('sequencer-btn').addEventListener('click', () => this.toggleSequencerMode());
        document.getElementById('edit-btn').addEventListener('click', () => this.toggleEditMode());
        
        // Clear pattern button
        document.getElementById('clear-pattern-btn').addEventListener('click', () => this.clearPattern());
        
        document.querySelectorAll('.pad').forEach((pad, index) => {
            pad.addEventListener('mousedown', () => this.handlePadPress(index));
            pad.addEventListener('mouseup', () => this.handlePadRelease(index));
            pad.addEventListener('mouseleave', () => this.handlePadRelease(index));
            
            // Add touch support for mobile
            pad.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handlePadPress(index);
            });
            pad.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handlePadRelease(index);
            });
            pad.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this.handlePadRelease(index);
            });
        });

        document.querySelectorAll('.step').forEach((step, index) => {
            step.addEventListener('click', () => this.toggleStep(index));
        });

        // Enhanced tempo control with mobile-friendly gestures
        this.setupTempoControl();

        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        document.addEventListener('keyup', (e) => this.handleKeyRelease(e));
        
        this.setupEditControls();
        this.setupTrimHandles();
        this.setupDragAndDrop();
    }

    handleKeyPress(e) {
        const keyMap = {
            '1': 0, '2': 1, '3': 2, '4': 3,
            'q': 4, 'w': 5, 'e': 6, 'r': 7,
            'a': 8, 's': 9, 'd': 10, 'f': 11,
            'z': 12, 'x': 13, 'c': 14, 'v': 15
        };

        const padIndex = keyMap[e.key.toLowerCase()];
        if (padIndex !== undefined && !e.repeat) {
            this.handlePadPress(padIndex);
        }

        if (e.key === ' ') {
            e.preventDefault();
            this.toggleSequencer();
        }
    }

    handleKeyRelease(e) {
        const keyMap = {
            '1': 0, '2': 1, '3': 2, '4': 3,
            'q': 4, 'w': 5, 'e': 6, 'r': 7,
            'a': 8, 's': 9, 'd': 10, 'f': 11,
            'z': 12, 'x': 13, 'c': 14, 'v': 15
        };

        const padIndex = keyMap[e.key.toLowerCase()];
        if (padIndex !== undefined) {
            this.handlePadRelease(padIndex);
        }
    }

    handlePadPress(index) {
        const pad = document.querySelector(`[data-pad="${index}"]`);
        pad.classList.add('active');

        console.log('handlePadPress:', index);
        console.log('recordMode:', this.recordMode);
        console.log('isRecording:', this.isRecording);
        console.log('isSequencerMode:', this.isSequencerMode);

        if (this.recordMode && !this.isRecording) {
            console.log('Starting recording mode');
            this.startRecording(index);
        } else if (this.isEditMode) {
            console.log('Edit mode - selecting pad for editing');
            this.editingPad = index;
            this.updateEditMode();
            // Also play the sample if it exists so you can test while editing
            if (this.samples[index]) {
                this.playSampleWithEffects(index);
            }
        } else if (this.isSequencerMode && !this.isRealtimeRecording) {
            console.log('Sequencer mode - selecting pad');
            this.selectedPad = index;
            this.updateSequencerPadSelection();
            // Also play the sample so you can hear what you're sequencing
            if (this.samples[index]) {
                this.playSampleWithEffects(index);
            }
        } else {
            console.log('Play mode - playing sample');
            this.playSample(index);
            
            // If realtime recording is active, record this pad hit to the current step
            if (this.isRealtimeRecording) {
                this.recordPadHit(index);
            }
        }
    }

    handlePadRelease(index) {
        const pad = document.querySelector(`[data-pad="${index}"]`);
        
        // Don't remove active class if we're in edit mode and this is the editing pad
        // or if we're in sequencer mode and this is the selected pad
        if (!(this.isEditMode && index === this.editingPad) && 
            !(this.isSequencerMode && index === this.selectedPad)) {
            pad.classList.remove('active');
        }

        if (this.isRecording && this.recordingPad === index) {
            this.stopRecording();
        }
    }

    updatePadSelection() {
        document.querySelectorAll('.pad').forEach((pad, index) => {
            pad.classList.toggle('active', index === this.selectedPad);
        });
    }

    updateSequencerPadSelection() {
        // Update pad visual selection
        document.querySelectorAll('.pad').forEach((pad, index) => {
            pad.classList.toggle('active', index === this.selectedPad);
        });
        
        // Update sequencer header info
        document.getElementById('selected-pad-number').textContent = String(this.selectedPad + 1).padStart(2, '0');
        const padNameElement = document.getElementById('selected-pad-name');
        
        if (this.samples[this.selectedPad]) {
            padNameElement.textContent = 'loaded';
            padNameElement.classList.add('has-sample');
        } else {
            padNameElement.textContent = 'empty';
            padNameElement.classList.remove('has-sample');
        }
        
        // Load the pattern for this pad
        this.loadSequencePattern();
    }

    async startRecording(padIndex) {
        console.log('startRecording called for pad:', padIndex);
        console.log('Stream available:', !!this.stream);
        console.log('Already recording:', this.isRecording);
        
        if (!this.stream) {
            return;
        }
        
        if (this.isRecording) {
            console.log('Already recording, ignoring');
            return;
        }

        // Check for MediaRecorder support
        if (!window.MediaRecorder) {
            return;
        }

        this.isRecording = true;
        this.recordingPad = padIndex;
        
        const pad = document.querySelector(`[data-pad="${padIndex}"]`);
        pad.classList.add('recording');
        

        try {
            const chunks = [];
            this.mediaRecorder = new MediaRecorder(this.stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                try {
                    const blob = new Blob(chunks, { type: 'audio/wav' });
                    const arrayBuffer = await blob.arrayBuffer();
                    
                    // Ensure audio context is ready
                    if (this.audioContext.state === 'suspended') {
                        await this.audioContext.resume();
                    }
                    
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    
                    // Clean up previous sample to prevent memory leaks
                    if (this.samples[padIndex]) {
                        this.samples[padIndex] = null;
                    }
                    
                    this.samples[padIndex] = audioBuffer;
                    pad.classList.add('has-sample');
                    pad.classList.remove('recording');
                    
                } catch (decodeError) {
                    console.error('Audio decode error:', decodeError);
                    pad.classList.remove('recording');
                }
            };

            this.mediaRecorder.start();
        } catch (error) {
            console.error('Recording error:', error);
            this.isRecording = false;
            this.recordingPad = null;
            pad.classList.remove('recording');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.recordingPad = null;
        }
    }

    toggleRecord() {
        const recordBtn = document.getElementById('record-btn');
        
        if (this.recordMode) {
            // Exit record mode
            if (this.isRecording) {
                this.stopRecording();
            }
            this.recordMode = false;
            recordBtn.classList.remove('active');
        } else {
            // Enter record mode (audio sample recording only)
            this.recordMode = true;
            recordBtn.classList.add('active');
        }
    }

    toggleWrite() {
        const writeBtn = document.getElementById('write-btn');
        
        if (this.writeMode) {
            // Exit write mode
            this.writeMode = false;
            this.isRealtimeRecording = false;
            writeBtn.classList.remove('active');
        } else {
            // Enter write mode (performance recording)
            this.writeMode = true;
            writeBtn.classList.add('active');
            
            // Enable realtime recording if sequencer is also playing
            if (this.isSequencerPlaying) {
                this.isRealtimeRecording = true;
            }
        }
    }

    async playSample(index) {
        if (this.shouldPadPlay(index)) {
            this.playSampleWithEffects(index);
        }
    }

    shouldPadPlay(index) {
        // Check if any pads are soloed
        const hasSoloedPads = this.soloedPads.some(solo => solo);
        
        if (hasSoloedPads) {
            // If there are soloed pads, only play soloed pads
            return this.soloedPads[index];
        } else {
            // If no pads are soloed, play unless muted
            return !this.mutedPads[index];
        }
    }

    async playSampleWithEffects(index) {
        console.log('playSampleWithEffects called for index:', index);
        console.log('Sample exists:', !!this.samples[index]);
        console.log('AudioContext exists:', !!this.audioContext);
        console.log('AudioContext state:', this.audioContext?.state);
        
        if (!this.samples[index]) {
            console.log('No sample at index', index);
            return;
        }
        
        if (!this.audioContext) {
            console.log('No audio context');
            return;
        }

        try {
            // Ensure audio context is ready
            if (this.audioContext.state === 'suspended') {
                console.log('Resuming suspended audio context');
                await this.audioContext.resume();
            }

            const params = this.sampleParams[index];
            const currentTime = this.audioContext.currentTime;

            // Handle mono mode - stop previous instance
            if (params.polyMode === 'mono' && this.activeSources[index]) {
                try {
                    this.activeSources[index].stop();
                } catch (e) {
                    // Source might already be stopped
                }
                this.activeSources[index] = null;
            }

            // Create audio nodes
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            const filterNode = this.audioContext.createBiquadFilter();
            
            // Set up source with trimming
            source.buffer = this.samples[index];
            source.playbackRate.value = params.pitch;
            
            // Calculate trim positions in seconds
            const sampleDuration = source.buffer.duration;
            const trimStartTime = params.trimStart * sampleDuration;
            const trimEndTime = params.trimEnd * sampleDuration;
            const trimDuration = trimEndTime - trimStartTime;
            
            // Set up filter
            filterNode.type = params.filterType;
            filterNode.frequency.value = params.filterFreq;
            filterNode.Q.value = params.filterRes;
            
            // Connect audio graph
            source.connect(filterNode);
            filterNode.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Set up ADSR envelope
            const attackTime = params.attack;
            const decayTime = params.decay;
            const sustainLevel = params.sustain;
            const releaseTime = params.release;
            
            // Start with silence
            gainNode.gain.setValueAtTime(0, currentTime);
            
            // Attack phase
            gainNode.gain.linearRampToValueAtTime(0.8, currentTime + attackTime);
            
            // Decay phase
            gainNode.gain.linearRampToValueAtTime(0.8 * sustainLevel, currentTime + attackTime + decayTime);
            
            // Sustain phase (maintain level until release)
            const sustainEnd = currentTime + attackTime + decayTime + 0.1; // Short sustain for triggered samples
            
            // Release phase
            gainNode.gain.setValueAtTime(0.8 * sustainLevel, sustainEnd);
            gainNode.gain.linearRampToValueAtTime(0, sustainEnd + releaseTime);
            
            // Track source for mono mode
            if (params.polyMode === 'mono') {
                this.activeSources[index] = source;
            }

            // Clean up when source ends
            source.onended = () => {
                if (this.activeSources[index] === source) {
                    this.activeSources[index] = null;
                }
            };

            // Start playback with trimming
            source.start(currentTime, trimStartTime, trimDuration);
            
            // Stop source after envelope completes (or trim duration, whichever is shorter)
            const totalDuration = Math.min(sustainEnd + releaseTime + 0.1 - currentTime, trimDuration);
            source.stop(currentTime + totalDuration);
            
            console.log('Sample playing with effects successfully');
        } catch (error) {
            console.error('Playback error:', error);
        }
    }

    toggleSequencerMode() {
        this.isSequencerMode = !this.isSequencerMode;
        const sequencerBtn = document.getElementById('sequencer-btn');
        const sequencerControls = document.getElementById('sequencer-controls');
        
        if (this.isSequencerMode) {
            sequencerBtn.classList.add('active');
            sequencerControls.style.display = 'block';
            this.updateSequencerPadSelection();
        } else {
            sequencerBtn.classList.remove('active');
            sequencerControls.style.display = 'none';
            document.querySelectorAll('.pad').forEach(pad => pad.classList.remove('active'));
        }
    }

    toggleStep(stepIndex) {
        if (!this.isSequencerMode) return;
        
        this.sequencePatterns[this.selectedPad][stepIndex] = !this.sequencePatterns[this.selectedPad][stepIndex];
        const step = document.querySelector(`[data-step="${stepIndex}"]`);
        step.classList.toggle('active', this.sequencePatterns[this.selectedPad][stepIndex]);
    }

    togglePlay() {
        const playBtn = document.getElementById('play-btn');
        
        if (this.isSequencerPlaying) {
            this.stopSequencer();
            playBtn.classList.remove('active');
            this.isRealtimeRecording = false;
        } else {
            // Start sequencer regardless of current mode
            this.startSequencer();
            playBtn.classList.add('active');
            
            // Enable realtime recording if write mode is also active
            if (this.writeMode) {
                this.isRealtimeRecording = true;
            }
        }
    }

    toggleSequencer() {
        this.togglePlay();
    }

    startSequencer() {
        if (this.isSequencerPlaying) return;
        
        this.isSequencerPlaying = true;
        this.currentStep = 0;
        
        const stepTime = (60 / this.tempo / 4) * 1000;
        
        this.stepInterval = setInterval(() => {
            this.playStep();
        }, stepTime);
    }

    stopSequencer() {
        this.isSequencerPlaying = false;
        if (this.stepInterval) {
            clearInterval(this.stepInterval);
            this.stepInterval = null;
        }
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('current');
        });
    }

    playStep() {
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('current');
        });

        const currentStepElement = document.querySelector(`[data-step="${this.currentStep}"]`);
        if (currentStepElement) {
            currentStepElement.classList.add('current');
        }

        // Play all pads that have this step enabled
        for (let padIndex = 0; padIndex < 16; padIndex++) {
            if (this.sequencePatterns[padIndex][this.currentStep]) {
                this.playSample(padIndex);
                this.triggerPadGlow(padIndex);
            }
        }

        this.currentStep = (this.currentStep + 1) % 16;
    }

    stop() {
        // Stop sequencer if running
        if (this.isSequencerPlaying) {
            this.stopSequencer();
        }
        
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }
        
        // Stop all active samples (for mono mode)
        this.activeSources.forEach((source, index) => {
            if (source) {
                try {
                    source.stop();
                } catch (e) {
                    // Source might already be stopped
                }
                this.activeSources[index] = null;
            }
        });
        
        // Reset UI states
        document.getElementById('play-btn').classList.remove('active');
        if (!this.recordMode) {
            document.getElementById('record-btn').classList.remove('active');
        }
    }

    updateTempo() {
        document.getElementById('tempo-display').textContent = this.tempo;
        
        if (this.isSequencerPlaying) {
            this.stopSequencer();
            this.startSequencer();
        }
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        const editBtn = document.getElementById('edit-btn');
        const editControls = document.getElementById('edit-controls');
        
        if (this.isEditMode) {
            editBtn.classList.add('active');
            editControls.style.display = 'block';
            this.updateEditMode();
            document.getElementById('edit-status').textContent = '';
        } else {
            editBtn.classList.remove('active');
            editControls.style.display = 'none';
            document.getElementById('edit-status').textContent = '';
            document.querySelectorAll('.pad').forEach(pad => pad.classList.remove('active'));
        }
    }

    updateEditMode() {
        // Update pad selection visual
        document.querySelectorAll('.pad').forEach((pad, index) => {
            pad.classList.toggle('active', index === this.editingPad);
        });
        
        // Set the edit accent color to match the current pad
        const editAccentColor = this.padColors[this.editingPad];
        document.documentElement.style.setProperty('--edit-accent-color', editAccentColor);
        
        // Update edit panel
        document.getElementById('edit-pad-number').textContent = String(this.editingPad + 1).padStart(2, '0');
        
        if (this.samples[this.editingPad]) {
            this.loadEditParams();
            this.drawWaveform();
            this.updateTrimHandles();
            this.updateTrimInfo();
            document.getElementById('edit-status').textContent = `editing pad ${String(this.editingPad + 1).padStart(2, '0')}`;
        } else {
            document.getElementById('edit-status').textContent = `pad ${String(this.editingPad + 1).padStart(2, '0')} empty`;
        }
    }

    setupEditControls() {
        // ADSR controls
        document.getElementById('attack-knob').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.sampleParams[this.editingPad].attack = value;
            document.getElementById('attack-value').textContent = value.toFixed(2);
        });
        
        document.getElementById('decay-knob').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.sampleParams[this.editingPad].decay = value;
            document.getElementById('decay-value').textContent = value.toFixed(2);
        });
        
        document.getElementById('sustain-knob').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.sampleParams[this.editingPad].sustain = value;
            document.getElementById('sustain-value').textContent = value.toFixed(2);
        });
        
        document.getElementById('release-knob').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.sampleParams[this.editingPad].release = value;
            document.getElementById('release-value').textContent = value.toFixed(2);
        });

        // Pitch control
        document.getElementById('pitch-knob').addEventListener('input', (e) => {
            this.sampleParams[this.editingPad].pitch = parseFloat(e.target.value);
            const semitones = Math.round(12 * Math.log2(e.target.value));
            document.getElementById('pitch-value').textContent = semitones > 0 ? `+${semitones}` : semitones.toString();
        });

        // Filter controls
        document.querySelectorAll('input[name="filter-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sampleParams[this.editingPad].filterType = e.target.value;
            });
        });

        // Poly mode controls
        document.querySelectorAll('input[name="poly-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sampleParams[this.editingPad].polyMode = e.target.value;
            });
        });
        
        document.getElementById('filter-freq-knob').addEventListener('input', (e) => {
            this.sampleParams[this.editingPad].filterFreq = parseFloat(e.target.value);
            document.getElementById('filter-freq-value').textContent = e.target.value;
        });
        
        document.getElementById('filter-res-knob').addEventListener('input', (e) => {
            this.sampleParams[this.editingPad].filterRes = parseFloat(e.target.value);
            document.getElementById('filter-res-value').textContent = e.target.value;
        });

    }

    loadEditParams() {
        const params = this.sampleParams[this.editingPad];
        
        // Load ADSR values
        document.getElementById('attack-knob').value = params.attack;
        document.getElementById('attack-value').textContent = params.attack.toFixed(2);
        document.getElementById('decay-knob').value = params.decay;
        document.getElementById('decay-value').textContent = params.decay.toFixed(2);
        document.getElementById('sustain-knob').value = params.sustain;
        document.getElementById('sustain-value').textContent = params.sustain.toFixed(2);
        document.getElementById('release-knob').value = params.release;
        document.getElementById('release-value').textContent = params.release.toFixed(2);
        
        // Load pitch value
        document.getElementById('pitch-knob').value = params.pitch;
        const semitones = Math.round(12 * Math.log2(params.pitch));
        document.getElementById('pitch-value').textContent = semitones > 0 ? `+${semitones}` : semitones.toString();
        
        // Load filter values
        document.querySelector(`input[value="${params.filterType}"]`).checked = true;
        document.getElementById('filter-freq-knob').value = params.filterFreq;
        document.getElementById('filter-freq-value').textContent = params.filterFreq;
        document.getElementById('filter-res-knob').value = params.filterRes;
        document.getElementById('filter-res-value').textContent = params.filterRes.toFixed(1);
        
        // Load poly mode
        document.querySelector(`input[name="poly-mode"][value="${params.polyMode}"]`).checked = true;
    }

    drawWaveform() {
        const canvas = document.getElementById('waveform-canvas');
        const ctx = canvas.getContext('2d');
        const buffer = this.samples[this.editingPad];
        
        if (!buffer) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        
        ctx.beginPath();
        const editAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--edit-accent-color') || '#4a9eff';
        ctx.strokeStyle = editAccentColor;
        ctx.lineWidth = 1;
        
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        
        ctx.stroke();
        
        // Draw trim overlay
        this.updateTrimOverlay();
    }

    setupTrimHandles() {
        const startHandle = document.getElementById('start-handle');
        const endHandle = document.getElementById('end-handle');
        const container = document.querySelector('.waveform-container');
        
        let isDragging = false;
        let dragHandle = null;
        
        const startDrag = (handle, e) => {
            isDragging = true;
            dragHandle = handle;
            e.preventDefault();
        };
        
        const drag = (e) => {
            if (!isDragging || !this.samples[this.editingPad]) return;
            
            const rect = container.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const position = x / rect.width;
            
            if (dragHandle === startHandle) {
                this.sampleParams[this.editingPad].trimStart = Math.min(position, this.sampleParams[this.editingPad].trimEnd - 0.01);
            } else if (dragHandle === endHandle) {
                this.sampleParams[this.editingPad].trimEnd = Math.max(position, this.sampleParams[this.editingPad].trimStart + 0.01);
            }
            
            this.updateTrimHandles();
            this.updateTrimInfo();
        };
        
        const endDrag = () => {
            isDragging = false;
            dragHandle = null;
        };
        
        // Mouse events
        startHandle.addEventListener('mousedown', (e) => startDrag(startHandle, e));
        endHandle.addEventListener('mousedown', (e) => startDrag(endHandle, e));
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', endDrag);
        
        // Touch events
        startHandle.addEventListener('touchstart', (e) => startDrag(startHandle, e.touches[0]));
        endHandle.addEventListener('touchstart', (e) => startDrag(endHandle, e.touches[0]));
        document.addEventListener('touchmove', (e) => drag(e.touches[0]));
        document.addEventListener('touchend', endDrag);
    }

    updateTrimHandles() {
        const params = this.sampleParams[this.editingPad];
        const startHandle = document.getElementById('start-handle');
        const endHandle = document.getElementById('end-handle');
        
        startHandle.style.left = (params.trimStart * 100) + '%';
        endHandle.style.left = (params.trimEnd * 100) + '%';
        endHandle.style.transform = 'translateX(-100%)';
        
        this.updateTrimOverlay();
    }

    updateTrimOverlay() {
        const params = this.sampleParams[this.editingPad];
        const overlay = document.getElementById('trim-overlay');
        
        const startPercent = params.trimStart * 100;
        const endPercent = params.trimEnd * 100;
        
        // Create mask to show only the trimmed region
        overlay.style.background = `linear-gradient(to right, 
            rgba(0,0,0,0.7) 0%, 
            rgba(0,0,0,0.7) ${startPercent}%, 
            transparent ${startPercent}%, 
            transparent ${endPercent}%, 
            rgba(0,0,0,0.7) ${endPercent}%, 
            rgba(0,0,0,0.7) 100%)`;
    }

    updateTrimInfo() {
        if (!this.samples[this.editingPad]) return;
        
        const params = this.sampleParams[this.editingPad];
        const duration = this.samples[this.editingPad].duration;
        
        const startTime = params.trimStart * duration;
        const endTime = params.trimEnd * duration;
        const length = endTime - startTime;
        
        document.getElementById('trim-start-value').textContent = startTime.toFixed(2);
        document.getElementById('trim-end-value').textContent = endTime.toFixed(2);
        document.getElementById('trim-length-value').textContent = length.toFixed(2);
    }

    loadSequencePattern() {
        // Load the pattern for the currently selected pad
        const pattern = this.sequencePatterns[this.selectedPad];
        document.querySelectorAll('.step').forEach((step, index) => {
            step.classList.toggle('active', pattern[index]);
        });
    }

    recordPadHit(padIndex) {
        // Record the pad hit to the current step position
        this.sequencePatterns[padIndex][this.currentStep] = true;
        
        // Update visual if this pad is currently selected in sequencer mode
        if (this.isSequencerMode && this.selectedPad === padIndex) {
            const step = document.querySelector(`[data-step="${this.currentStep}"]`);
            if (step) {
                step.classList.add('active');
            }
        }
    }

    clearPattern() {
        // Clear the pattern for the currently selected pad
        this.sequencePatterns[this.selectedPad].fill(false);
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
    }

    setupDragAndDrop() {
        // Prevent default drag behaviors on the whole document
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
        });

        // Add drag and drop to each pad
        document.querySelectorAll('.pad').forEach((pad, index) => {
            pad.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pad.classList.add('drag-over');
            });

            pad.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only remove if we're actually leaving the pad
                if (!pad.contains(e.relatedTarget)) {
                    pad.classList.remove('drag-over');
                }
            });

            pad.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pad.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
                const audioFile = files.find(file => 
                    file.type === 'audio/wav' || 
                    file.type === 'audio/wave' || 
                    file.name.toLowerCase().endsWith('.wav')
                );

                if (audioFile) {
                    this.loadAudioFile(audioFile, index);
                } else {
                    // Show error briefly
                    const status = document.getElementById('recording-status');
                }
            });
        });
    }

    triggerPadGlow(padIndex) {
        const pad = document.querySelector(`[data-pad="${padIndex}"]`);
        if (pad) {
            // Remove existing animation class if present
            pad.classList.remove('sequencer-trigger');
            // Force reflow to ensure animation restart
            pad.offsetHeight;
            // Add animation class
            pad.classList.add('sequencer-trigger');
            
            // Remove class after animation completes
            setTimeout(() => {
                pad.classList.remove('sequencer-trigger');
            }, 300);
        }
    }

    async loadAudioFile(file, padIndex) {
        try {
            // Show loading status
            const status = document.getElementById('recording-status');

            // Read file as array buffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Ensure audio context is ready
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Clean up previous sample to prevent memory leaks
            if (this.samples[padIndex]) {
                this.samples[padIndex] = null;
            }
            
            // Store the sample
            this.samples[padIndex] = audioBuffer;
            
            // Update visual state
            const pad = document.querySelector(`[data-pad="${padIndex}"]`);
            pad.classList.add('has-sample');
            
            // Show success message

            // If we're in edit mode and this is the current pad, update the display
            if (this.isEditMode && this.editingPad === padIndex) {
                this.updateEditMode();
            }

            // If we're in sequencer mode and this is the current pad, update the display
            if (this.isSequencerMode && this.selectedPad === padIndex) {
                this.updateSequencerPadSelection();
            }

        } catch (error) {
            console.error('Error loading audio file:', error);
            const status = document.getElementById('recording-status');
        }
    }

    setupTempoControl() {
        const tempoControl = document.querySelector('.tempo-control-header');
        let isDraggingTempo = false;
        let tempoStartY = 0;
        let tempoStartValue = 120;
        let tempoChangeTimeout = null;
        let isTempoAdjusting = false;

        // Enhanced gesture handling for mobile and desktop
        const startTempoAdjustment = (clientY) => {
            isDraggingTempo = true;
            isTempoAdjusting = true;
            tempoStartY = clientY;
            tempoStartValue = this.tempo;
            tempoControl.classList.add('tempo-adjusting');
            
            // Haptic feedback on mobile
            if (navigator.vibrate) {
                navigator.vibrate(5);
            }
        };

        const updateTempo = (clientY) => {
            if (!isDraggingTempo) return;
            
            const deltaY = tempoStartY - clientY;
            const sensitivity = window.innerWidth < 768 ? 0.3 : 0.5; // More sensitive on mobile
            const tempoChange = Math.round(deltaY * sensitivity);
            const newTempo = Math.max(60, Math.min(200, tempoStartValue + tempoChange));
            
            if (newTempo !== this.tempo) {
                this.tempo = newTempo;
                this.updateTempo();
                
                // Subtle haptic feedback during adjustment
                if (navigator.vibrate && Math.abs(newTempo - tempoStartValue) % 5 === 0) {
                    navigator.vibrate(3);
                }

                // Visual pulse effect
                tempoControl.classList.add('tempo-pulse');
                clearTimeout(tempoChangeTimeout);
                tempoChangeTimeout = setTimeout(() => {
                    tempoControl.classList.remove('tempo-pulse');
                }, 100);
            }
        };

        const endTempoAdjustment = () => {
            if (!isDraggingTempo) return;
            
            isDraggingTempo = false;
            tempoControl.classList.remove('tempo-adjusting');
            
            setTimeout(() => {
                isTempoAdjusting = false;
            }, 150);
        };

        // Mouse events
        tempoControl.addEventListener('mousedown', (e) => {
            startTempoAdjustment(e.clientY);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            updateTempo(e.clientY);
        });

        document.addEventListener('mouseup', endTempoAdjustment);

        // Touch events for mobile
        tempoControl.addEventListener('touchstart', (e) => {
            startTempoAdjustment(e.touches[0].clientY);
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (isDraggingTempo) {
                updateTempo(e.touches[0].clientY);
                e.preventDefault();
            }
        });

        document.addEventListener('touchend', (e) => {
            endTempoAdjustment();
        });

        // Double tap for quick tempo reset to 120
        let lastTap = 0;
        tempoControl.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 300 && tapLength > 0 && !isTempoAdjusting) {
                this.tempo = 120;
                this.updateTempo();
                tempoControl.classList.add('tempo-reset');
                
                if (navigator.vibrate) {
                    navigator.vibrate([10, 50, 10]);
                }
                
                setTimeout(() => {
                    tempoControl.classList.remove('tempo-reset');
                }, 300);
            }
            lastTap = currentTime;
        });
    }

    setupMuteSoloControls() {
        // Add event listeners for all mute buttons
        document.querySelectorAll('.mute-btn').forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMute(index);
            });
            
            // Add touch support for mobile
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMute(index);
            });
        });

        // Add event listeners for all solo buttons
        document.querySelectorAll('.solo-btn').forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleSolo(index);
            });
            
            // Add touch support for mobile
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleSolo(index);
            });
        });
    }

    toggleMute(padIndex) {
        this.mutedPads[padIndex] = !this.mutedPads[padIndex];
        const muteBtn = document.querySelector(`.mute-btn[data-pad="${padIndex}"]`);
        muteBtn.classList.toggle('active', this.mutedPads[padIndex]);
    }

    toggleSolo(padIndex) {
        this.soloedPads[padIndex] = !this.soloedPads[padIndex];
        const soloBtn = document.querySelector(`.solo-btn[data-pad="${padIndex}"]`);
        soloBtn.classList.toggle('active', this.soloedPads[padIndex]);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sampler = new PO33Sampler();
    
    document.addEventListener('click', () => {
        if (sampler.audioContext && sampler.audioContext.state === 'suspended') {
            sampler.audioContext.resume();
        }
    });
});