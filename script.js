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
        this.sequencePatterns = new Array(4).fill(null).map(() => 
            new Array(16).fill(null).map(() => new Array(16).fill(false))
        );
        // Off-grid recording: store notes with precise timing
        this.offGridNotes = new Array(4).fill(null).map(() => 
            new Array(16).fill(null).map(() => [])
        );
        this.currentBank = 0;
        this.selectedPad = 0;
        this.tempo = 120;
        this.globalSwing = 0;  // Global swing amount (0-100)
        this.stepInterval = null;
        this.isRealtimeRecording = false;
        
        // Subdivision settings
        this.currentSubdivision = 16; // Current programming subdivision (4=quarter, 8=eighth, 16=sixteenth, 32=thirty-second)
        this.maxSubdivision = 32; // Finest resolution the sequencer runs at
        this.subStep = 0; // For tracking finest sub-divisions
        this.subStepCount = 16; // Visual step count (always 16)
        
        // Metronome properties
        this.metronomeEnabled = false;
        this.metronomeHighSound = null;
        this.metronomeLowSound = null;
        
        // Track active audio sources and nodes for mono mode and real-time control
        this.activeSources = new Array(16).fill(null);
        this.activeAudioNodes = new Array(16).fill(null).map(() => ({
            sources: [], // Array of active sources for poly mode
            filterNode: null,
            gainNode: null
        }));
        
        // Track pad hold state for looping
        this.padHoldState = new Array(16).fill(false);
        
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
            volume: 0.8,     // Volume level (0-1)
            filterType: 'lowpass',
            filterFreq: 8000,
            filterRes: 1,
            trimStart: 0.0,  // Start position (0-1)
            trimEnd: 1.0,    // End position (0-1)
            polyMode: 'poly', // 'poly' or 'mono'
            loopOnHold: false, // Loop sample when pad is held down
            oneShotMode: true,  // ONE-SHOT mode (bypasses ADSR), default true
            swing: 0,        // Pad-specific swing amount (0-100)
            subdivision: 4   // Note subdivision: 1=whole, 2=half, 4=quarter, 8=eighth, 16=sixteenth, 32=thirty-second
        }));
        
        // Waveform zoom state (per pad)
        this.waveformZoom = new Array(16).fill(null).map(() => ({
            zoomLevel: 1.0,    // 1.0 = full view, higher = zoomed in
            viewStart: 0.0,    // Start of visible window (0-1)
            viewEnd: 1.0,      // End of visible window (0-1)
            maxZoom: 32.0      // Maximum zoom level
        }));
        
        this.initializeAudio();
        this.setupEventListeners();
        this.updateTempo();
        this.applyPadColors();
        this.setupMuteSoloControls();
        this.updateBankIndicators();
        this.createMetronomeSound();
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
        document.getElementById('metronome-btn').addEventListener('click', () => this.toggleMetronome());
        
        // Clear pattern button
        document.getElementById('clear-pattern-btn').addEventListener('click', () => this.clearPattern());
        
        // Bank selection buttons
        document.querySelectorAll('.bank-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => this.switchBank(index));
        });
        
        // Subdivision buttons
        document.querySelectorAll('.subdivision-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.setCurrentSubdivision(parseInt(btn.dataset.subdivision)));
        });
        
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
        this.setupWaveformInteraction();
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

        // Waveform editing shortcuts (only in edit mode)
        if (this.isEditMode && this.samples[this.editingPad]) {
            const finePrecision = e.shiftKey ? 0.0001 : 0.001;
            const coarsePrecision = e.shiftKey ? 0.001 : 0.01;
            const precision = e.ctrlKey || e.metaKey ? finePrecision : coarsePrecision;
            
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.altKey) {
                        // Move start trim left
                        this.sampleParams[this.editingPad].trimStart = Math.max(0, 
                            this.sampleParams[this.editingPad].trimStart - precision);
                        this.updateTrimHandles();
                        this.updateTrimInfo();
                    } else {
                        // Pan left
                        this.panWaveform(this.editingPad, -1);
                    }
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.altKey) {
                        // Move start trim right
                        this.sampleParams[this.editingPad].trimStart = Math.min(
                            this.sampleParams[this.editingPad].trimEnd - 0.001,
                            this.sampleParams[this.editingPad].trimStart + precision);
                        this.updateTrimHandles();
                        this.updateTrimInfo();
                    } else {
                        // Pan right
                        this.panWaveform(this.editingPad, 1);
                    }
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    if (e.altKey) {
                        // Move end trim right
                        this.sampleParams[this.editingPad].trimEnd = Math.min(1,
                            this.sampleParams[this.editingPad].trimEnd + precision);
                        this.updateTrimHandles();
                        this.updateTrimInfo();
                    } else {
                        // Zoom in
                        this.zoomWaveform(this.editingPad, 1.2);
                    }
                    break;
                    
                case 'ArrowDown':
                    e.preventDefault();
                    if (e.altKey) {
                        // Move end trim left
                        this.sampleParams[this.editingPad].trimEnd = Math.max(
                            this.sampleParams[this.editingPad].trimStart + 0.001,
                            this.sampleParams[this.editingPad].trimEnd - precision);
                        this.updateTrimHandles();
                        this.updateTrimInfo();
                    } else {
                        // Zoom out
                        this.zoomWaveform(this.editingPad, 0.8);
                    }
                    break;
                    
                case '0':
                    e.preventDefault();
                    this.resetWaveformZoom(this.editingPad);
                    break;
                    
                case 'z':
                    if (e.shiftKey) {
                        e.preventDefault();
                        // Snap start trim to zero crossing
                        const buffer = this.samples[this.editingPad];
                        const startSample = this.sampleParams[this.editingPad].trimStart * buffer.length;
                        const zeroPosition = this.findZeroCrossing(buffer, startSample);
                        this.sampleParams[this.editingPad].trimStart = zeroPosition;
                        this.updateTrimHandles();
                        this.updateTrimInfo();
                    }
                    break;
                    
                case 'x':
                    if (e.shiftKey) {
                        e.preventDefault();
                        // Snap end trim to zero crossing
                        const buffer = this.samples[this.editingPad];
                        const endSample = this.sampleParams[this.editingPad].trimEnd * buffer.length;
                        const zeroPosition = this.findZeroCrossing(buffer, endSample);
                        this.sampleParams[this.editingPad].trimEnd = zeroPosition;
                        this.updateTrimHandles();
                        this.updateTrimInfo();
                    }
                    break;
            }
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
        
        // Track pad hold state
        this.padHoldState[index] = true;

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
            // Sync sequencer selection if sequencer mode is also active
            if (this.isSequencerMode) {
                this.selectedPad = index;
                this.updateSequencerPadSelection();
            }
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
        
        // Track pad hold state
        this.padHoldState[index] = false;
        
        // Stop looping audio source if it was looping
        if (this.sampleParams[index].loopOnHold) {
            this.stopActiveAudio(index);
        }
        
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
        const padSubdivisionElement = document.getElementById('selected-pad-subdivision');
        
        if (this.samples[this.selectedPad]) {
            padNameElement.textContent = 'loaded';
            padNameElement.classList.add('has-sample');
        } else {
            padNameElement.textContent = 'empty';
            padNameElement.classList.remove('has-sample');
        }
        
        // Show the pad's current subdivision
        const padSubdivision = this.sampleParams[this.selectedPad].subdivision;
        padSubdivisionElement.textContent = `1/${padSubdivision}`;
        
        // Update subdivision buttons to reflect this pad's setting
        this.currentSubdivision = padSubdivision;
        document.querySelectorAll('.subdivision-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.subdivision) === padSubdivision);
        });
        
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

    stopActiveAudio(index) {
        // Stop active sources
        if (this.activeSources[index]) {
            try {
                this.activeSources[index].stop();
            } catch (e) {
                // Source might already be stopped
            }
            this.activeSources[index] = null;
        }
        
        // Clear active nodes
        this.activeAudioNodes[index].sources.forEach(nodeSet => {
            try {
                nodeSet.source.stop();
            } catch (e) {
                // Source might already be stopped
            }
        });
        
        this.activeAudioNodes[index].filterNode = null;
        this.activeAudioNodes[index].gainNode = null;
        this.activeAudioNodes[index].sources = [];
    }

    updateActiveAudioNodes(index, paramType, value) {
        // Update active audio nodes in real-time
        const nodes = this.activeAudioNodes[index];
        
        if (!nodes.sources.length) return; // No active audio
        
        const currentTime = this.audioContext.currentTime;
        
        nodes.sources.forEach(nodeSet => {
            try {
                switch(paramType) {
                    case 'filterFreq':
                        if (nodeSet.filterNode) {
                            nodeSet.filterNode.frequency.setValueAtTime(value, currentTime);
                        }
                        break;
                    case 'filterRes':
                        if (nodeSet.filterNode) {
                            nodeSet.filterNode.Q.setValueAtTime(value, currentTime);
                        }
                        break;
                    case 'filterType':
                        if (nodeSet.filterNode) {
                            nodeSet.filterNode.type = value;
                        }
                        break;
                    case 'pitch':
                        if (nodeSet.source) {
                            nodeSet.source.playbackRate.setValueAtTime(value, currentTime);
                        }
                        break;
                    case 'volume':
                        if (nodeSet.gainNode) {
                            // Only update if in ONE-SHOT mode (ADSR mode has scheduled envelope)
                            const params = this.sampleParams[index];
                            if (params.oneShotMode) {
                                nodeSet.gainNode.gain.setValueAtTime(value, currentTime);
                            }
                        }
                        break;
                }
            } catch (e) {
                // Node might have been disconnected
                console.warn('Error updating audio node:', e);
            }
        });
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
            if (params.polyMode === 'mono') {
                this.stopActiveAudio(index);
            }

            // Create audio nodes
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            const filterNode = this.audioContext.createBiquadFilter();
            
            // Set up source with trimming and looping
            source.buffer = this.samples[index];
            source.playbackRate.value = params.pitch;
            
            // Calculate trim positions in seconds
            const sampleDuration = source.buffer.duration;
            const trimStartTime = params.trimStart * sampleDuration;
            const trimEndTime = params.trimEnd * sampleDuration;
            const trimDuration = trimEndTime - trimStartTime;
            
            // Set up looping if enabled and pad is held
            if (params.loopOnHold && this.padHoldState[index]) {
                source.loop = true;
                source.loopStart = trimStartTime;
                source.loopEnd = trimEndTime;
            }
            
            // Set up filter
            filterNode.type = params.filterType;
            filterNode.frequency.value = params.filterFreq;
            filterNode.Q.value = params.filterRes;
            
            // Connect audio graph
            source.connect(filterNode);
            filterNode.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Set up envelope - ADSR or ONE-SHOT mode
            if (params.oneShotMode) {
                // ONE-SHOT mode: just set volume directly without envelope
                gainNode.gain.setValueAtTime(params.volume, currentTime);
            } else {
                // ADSR mode: apply full envelope
                const attackTime = params.attack;
                const decayTime = params.decay;
                const sustainLevel = params.sustain;
                const releaseTime = params.release;
                
                // Start with silence
                gainNode.gain.setValueAtTime(0, currentTime);
                
                // Apply volume scaling to envelope
                const maxGain = params.volume;
                
                // Attack phase
                gainNode.gain.linearRampToValueAtTime(maxGain, currentTime + attackTime);
                
                // Decay phase
                gainNode.gain.linearRampToValueAtTime(maxGain * sustainLevel, currentTime + attackTime + decayTime);
                
                // Sustain phase (maintain level until release)
                const sustainEnd = currentTime + attackTime + decayTime + 0.1; // Short sustain for triggered samples
                
                // Release phase
                gainNode.gain.setValueAtTime(maxGain * sustainLevel, sustainEnd);
                gainNode.gain.linearRampToValueAtTime(0, sustainEnd + releaseTime);
            }
            
            // Track audio nodes for real-time control
            const audioNodeSet = {
                source: source,
                filterNode: filterNode,
                gainNode: gainNode
            };

            if (params.polyMode === 'mono') {
                // Store single set for mono mode
                this.activeSources[index] = source;
                this.activeAudioNodes[index].filterNode = filterNode;
                this.activeAudioNodes[index].gainNode = gainNode;
                this.activeAudioNodes[index].sources = [audioNodeSet];
            } else {
                // Add to array for poly mode
                this.activeAudioNodes[index].sources.push(audioNodeSet);
            }

            // Clean up when source ends
            source.onended = () => {
                if (params.polyMode === 'mono') {
                    if (this.activeSources[index] === source) {
                        this.activeSources[index] = null;
                        this.activeAudioNodes[index].filterNode = null;
                        this.activeAudioNodes[index].gainNode = null;
                        this.activeAudioNodes[index].sources = [];
                    }
                } else {
                    // Remove from poly mode array
                    const sourceIndex = this.activeAudioNodes[index].sources.findIndex(s => s.source === source);
                    if (sourceIndex !== -1) {
                        this.activeAudioNodes[index].sources.splice(sourceIndex, 1);
                    }
                }
            };

            // Start playback with trimming
            if (params.loopOnHold && this.padHoldState[index]) {
                // For looping, start without duration limit and loop the trimmed section
                source.start(currentTime, trimStartTime);
            } else {
                // For non-looping, use the existing logic with duration
                source.start(currentTime, trimStartTime, trimDuration);
                
                // Stop source timing based on mode
                if (params.oneShotMode) {
                    // ONE-SHOT mode: just play the sample through
                    source.stop(currentTime + trimDuration);
                } else {
                    // ADSR mode: stop after envelope completes (or trim duration, whichever is shorter)
                    const sustainEnd = currentTime + params.attack + params.decay + 0.1;
                    const totalDuration = Math.min(sustainEnd + params.release + 0.1 - currentTime, trimDuration);
                    source.stop(currentTime + totalDuration);
                }
            }
            
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
        
        const padSubdivision = this.sampleParams[this.selectedPad].subdivision;
        const stepsPerSubdivision = 16 / padSubdivision; // How many visual steps per note
        const canBeToggled = (stepIndex % stepsPerSubdivision) === 0;
        
        // Only allow toggling steps that align with the current subdivision
        if (canBeToggled) {
            this.sequencePatterns[this.currentBank][this.selectedPad][stepIndex] = !this.sequencePatterns[this.currentBank][this.selectedPad][stepIndex];
            const step = document.querySelector(`[data-step="${stepIndex}"]`);
            step.classList.toggle('active', this.sequencePatterns[this.currentBank][this.selectedPad][stepIndex]);
            
            // Update bank indicators
            this.updateBankIndicators();
        }
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
        this.subStep = 0;
        
        // Always run sequencer at the finest resolution (32nd notes)
        // This allows all subdivisions to be played correctly
        const quarterNoteTime = (60 / this.tempo) * 1000; // Quarter note in milliseconds
        const stepTime = quarterNoteTime / this.maxSubdivision; // 32nd note timing
        
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
        // Update visual step indicator - always show continuous progression across all 16 steps
        // regardless of subdivision, so user can see where they are in the full 16-step pattern
        const stepsPerBar = this.maxSubdivision * 4; // 32 * 4 = 128 substeps per bar (4/4 time)
        const visualStep = Math.floor((this.subStep / (stepsPerBar / 16)) % 16);
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('current');
        });

        const currentStepElement = document.querySelector(`[data-step="${visualStep}"]`);
        if (currentStepElement) {
            currentStepElement.classList.add('current');
        }

        // Schedule sample playback - check if we're on a visual step boundary
        // Each visual step represents a sixteenth note (8 substeps at 32nd note resolution)
        const subsPerVisualStep = stepsPerBar / 16; // 128 / 16 = 8 substeps per visual step
        
        // Only trigger samples on visual step boundaries (every 8 substeps)
        if (this.subStep % subsPerVisualStep === 0) {
            // Check each pad to see if it should play at this visual step
            for (let padIndex = 0; padIndex < 16; padIndex++) {
                const padSubdivision = this.sampleParams[padIndex].subdivision;
                const visualStepsPerPadSubdivision = 16 / padSubdivision; // How many visual steps per pad subdivision
                
                // Check if this visual step aligns with the pad's subdivision
                if (visualStep % visualStepsPerPadSubdivision === 0) {
                    
                    if (this.sequencePatterns[this.currentBank][padIndex][visualStep]) {
                        // Calculate swing for this specific hit
                        let swingDelay = 0;
                        
                        // Determine if this hit is on a musical off-beat based on the pad's subdivision
                        const isMusicalOffBeat = this.isMusicalOffBeat(visualStep, padSubdivision);
                        
                        if (isMusicalOffBeat) {
                            const quarterNoteTime = (60 / this.tempo) * 1000;
                            const subdivisionTime = quarterNoteTime / padSubdivision;
                            const maxSwingDelay = subdivisionTime * 0.5; // Max 50% of subdivision time
                            
                            // Apply global swing
                            if (this.globalSwing > 0) {
                                swingDelay = (this.globalSwing / 100) * maxSwingDelay;
                            }
                            
                            // Apply pad-specific swing (overrides global if higher)
                            const padSwingAmount = this.sampleParams[padIndex].swing;
                            if (padSwingAmount > 0) {
                                const padSwingDelay = (padSwingAmount / 100) * maxSwingDelay;
                                swingDelay = Math.max(swingDelay, padSwingDelay);
                            }
                        }
                        
                        setTimeout(() => {
                            this.playSample(padIndex);
                            this.triggerPadGlow(padIndex);
                        }, swingDelay);
                    }
                }
            }
        }
            
            // Play off-grid notes
            for (let padIndex = 0; padIndex < 16; padIndex++) {
                const offGridNotes = this.offGridNotes[this.currentBank][padIndex];
                offGridNotes.forEach(note => {
                    if (note.subStep === this.subStep) {
                        this.playSample(padIndex);
                        this.triggerPadGlow(padIndex);
                    }
                });
            }

        // Play metronome click on quarter note boundaries (every 8 32nd notes)
        if (this.metronomeEnabled && this.subStep % 8 === 0) {
            this.playMetronomeClick();
        }

        // Advance step counters (128 32nd notes = 1 full cycle through 16 visual steps)
        this.subStep = (this.subStep + 1) % 128;
        this.currentStep = Math.floor((this.subStep / 128) * 16);
    }

    isMusicalOffBeat(step, subdivision) {
        // Determine if a step is on a musical off-beat based on subdivision
        // For swing, we care about the "and" of beats (upbeats)
        
        switch(subdivision) {
            case 4: // Quarter notes: steps 1,3 are off-beats (but quarter notes don't really have swing)
                return step % 2 === 1;
            case 8: // Eighth notes: steps 1,3,5,7,9,11,13,15 are off-beats  
                return step % 2 === 1;
            case 16: // Sixteenth notes: steps 1,3,5,7,9,11,13,15 are off-beats (every other step)
                return step % 2 === 1;
            case 32: // Thirty-second notes: steps 1,3,5,7,9,11,13,15 are off-beats
                return step % 2 === 1;
            default:
                return false;
        }
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
        
        // Stop all active samples
        for (let i = 0; i < 16; i++) {
            this.stopActiveAudio(i);
        }
        
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
        // ADSR controls with mobile drag support
        this.setupADSRControl('attack', 0, 10, 0.01);
        this.setupADSRControl('decay', 0, 10, 0.01);
        this.setupADSRControl('sustain', 0, 1, 0.01);
        this.setupADSRControl('release', 0, 10, 0.01);

        // Volume control - setup as radial knob
        this.setupRadialKnob('volume', 0, 1, 0.01);

        // Pitch control - setup as radial knob
        this.setupRadialKnob('pitch', 0.5, 2, 0.01);

        // Filter controls
        document.querySelectorAll('input[name="filter-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sampleParams[this.editingPad].filterType = e.target.value;
                this.updateActiveAudioNodes(this.editingPad, 'filterType', e.target.value);
            });
        });

        // Poly mode controls
        document.querySelectorAll('input[name="poly-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.sampleParams[this.editingPad].polyMode = e.target.value;
            });
        });
        
        // Filter controls - setup as radial knobs
        this.setupRadialKnob('filter-freq', 80, 8000, 10);
        this.setupRadialKnob('filter-res', 0.1, 20, 0.1);

        // Swing controls - setup as radial knob
        this.setupRadialKnob('swing', 0, 100, 1);

        // Global swing control
        const globalSwingSlider = document.getElementById('global-swing');
        const swingDisplay = document.getElementById('swing-display');
        
        globalSwingSlider.addEventListener('input', (e) => {
            this.globalSwing = parseInt(e.target.value);
            swingDisplay.textContent = `${this.globalSwing}%`;
        });

        // Loop toggle control
        document.getElementById('loop-toggle').addEventListener('click', (e) => {
            this.sampleParams[this.editingPad].loopOnHold = !this.sampleParams[this.editingPad].loopOnHold;
            e.currentTarget.classList.toggle('active', this.sampleParams[this.editingPad].loopOnHold);
        });

        // One-shot toggle control
        document.getElementById('oneshot-toggle').addEventListener('click', (e) => {
            this.sampleParams[this.editingPad].oneShotMode = !this.sampleParams[this.editingPad].oneShotMode;
            e.currentTarget.classList.toggle('active', this.sampleParams[this.editingPad].oneShotMode);
        });

        // Zoom controls
        document.getElementById('zoom-in-btn').addEventListener('click', () => {
            this.zoomWaveform(this.editingPad, 2.0);
        });
        
        document.getElementById('zoom-out-btn').addEventListener('click', () => {
            this.zoomWaveform(this.editingPad, 0.5);
        });
        
        document.getElementById('zoom-reset-btn').addEventListener('click', () => {
            this.resetWaveformZoom(this.editingPad);
        });
        
        document.getElementById('pan-left-btn').addEventListener('click', () => {
            this.panWaveform(this.editingPad, -1);
        });
        
        document.getElementById('pan-right-btn').addEventListener('click', () => {
            this.panWaveform(this.editingPad, 1);
        });

    }

    loadEditParams() {
        const params = this.sampleParams[this.editingPad];
        
        // Load ADSR values and update visual rotation
        const updateKnobRotation = (paramName, value, min, max) => {
            const indicator = document.getElementById(`${paramName}-indicator`);
            if (indicator) {
                const normalizedValue = (value - min) / (max - min);
                const rotationAngle = -135 + (normalizedValue * 270);
                indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
            }
        };
        
        document.getElementById('attack-knob').value = params.attack;
        document.getElementById('attack-value').textContent = params.attack.toFixed(2);
        updateKnobRotation('attack', params.attack, 0, 10);
        
        document.getElementById('decay-knob').value = params.decay;
        document.getElementById('decay-value').textContent = params.decay.toFixed(2);
        updateKnobRotation('decay', params.decay, 0, 10);
        
        document.getElementById('sustain-knob').value = params.sustain;
        document.getElementById('sustain-value').textContent = params.sustain.toFixed(2);
        updateKnobRotation('sustain', params.sustain, 0, 1);
        
        document.getElementById('release-knob').value = params.release;
        document.getElementById('release-value').textContent = params.release.toFixed(2);
        updateKnobRotation('release', params.release, 0, 10);
        
        // Load volume value and update visual rotation
        document.getElementById('volume-knob').value = params.volume;
        document.getElementById('volume-value').textContent = params.volume.toFixed(2);
        const updateVolumeKnobRotation = (value, min, max) => {
            const indicator = document.getElementById('volume-indicator');
            if (indicator) {
                const normalizedValue = (value - min) / (max - min);
                const rotationAngle = -135 + (normalizedValue * 270);
                indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
            }
        };
        updateVolumeKnobRotation(params.volume, 0, 1);
        
        // Load pitch value and update visual rotation
        document.getElementById('pitch-knob').value = params.pitch;
        const semitones = Math.round(12 * Math.log2(params.pitch));
        document.getElementById('pitch-value').textContent = semitones > 0 ? `+${semitones}` : semitones.toString();
        const updatePitchKnobRotation = (value, min, max) => {
            const indicator = document.getElementById('pitch-indicator');
            if (indicator) {
                const normalizedValue = (value - min) / (max - min);
                const rotationAngle = -135 + (normalizedValue * 270);
                indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
            }
        };
        updatePitchKnobRotation(params.pitch, 0.5, 2);
        
        // Load filter values and update visual rotations
        document.querySelector(`input[value="${params.filterType}"]`).checked = true;
        document.getElementById('filter-freq-knob').value = params.filterFreq;
        document.getElementById('filter-freq-value').textContent = params.filterFreq;
        const updateFilterFreqKnobRotation = (value, min, max) => {
            const indicator = document.getElementById('filter-freq-indicator');
            if (indicator) {
                const normalizedValue = (value - min) / (max - min);
                const rotationAngle = -135 + (normalizedValue * 270);
                indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
            }
        };
        updateFilterFreqKnobRotation(params.filterFreq, 80, 8000);
        
        document.getElementById('filter-res-knob').value = params.filterRes;
        document.getElementById('filter-res-value').textContent = params.filterRes.toFixed(1);
        const updateFilterResKnobRotation = (value, min, max) => {
            const indicator = document.getElementById('filter-res-indicator');
            if (indicator) {
                const normalizedValue = (value - min) / (max - min);
                const rotationAngle = -135 + (normalizedValue * 270);
                indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
            }
        };
        updateFilterResKnobRotation(params.filterRes, 0.1, 20);
        
        // Load poly mode
        document.querySelector(`input[name="poly-mode"][value="${params.polyMode}"]`).checked = true;
        
        // Load loop toggle state
        document.getElementById('loop-toggle').classList.toggle('active', params.loopOnHold);
        
        // Load one-shot toggle state
        document.getElementById('oneshot-toggle').classList.toggle('active', params.oneShotMode);
        
        // Load swing value and update visual rotation
        document.getElementById('swing-knob').value = params.swing;
        document.getElementById('swing-value').textContent = params.swing;
        updateKnobRotation('swing', params.swing, 0, 100);
    }

    drawWaveform() {
        const canvas = document.getElementById('waveform-canvas');
        const ctx = canvas.getContext('2d');
        const buffer = this.samples[this.editingPad];
        
        if (!buffer) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const data = buffer.getChannelData(0);
        const zoom = this.waveformZoom[this.editingPad];
        
        // Calculate the visible range of samples
        const totalSamples = data.length;
        const viewStartSample = Math.floor(zoom.viewStart * totalSamples);
        const viewEndSample = Math.ceil(zoom.viewEnd * totalSamples);
        const visibleSamples = viewEndSample - viewStartSample;
        
        // Calculate step size for higher resolution when zoomed
        const samplesPerPixel = visibleSamples / canvas.width;
        const amp = canvas.height / 2;
        
        ctx.beginPath();
        const editAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--edit-accent-color') || '#4a9eff';
        ctx.strokeStyle = editAccentColor;
        ctx.lineWidth = 1;
        
        // Draw waveform with higher precision when zoomed
        for (let x = 0; x < canvas.width; x++) {
            const startSample = viewStartSample + Math.floor(x * samplesPerPixel);
            const endSample = Math.min(totalSamples - 1, viewStartSample + Math.floor((x + 1) * samplesPerPixel));
            
            let min = 1.0;
            let max = -1.0;
            
            // Sample the audio data for this pixel column
            for (let i = startSample; i <= endSample; i++) {
                if (i >= 0 && i < totalSamples) {
                    const value = data[i];
                    if (value < min) min = value;
                    if (value > max) max = value;
                }
            }
            
            // Draw vertical line representing min/max for this pixel
            ctx.moveTo(x, (1 + min) * amp);
            ctx.lineTo(x, (1 + max) * amp);
        }
        
        ctx.stroke();
        
        // Draw zero line when zoomed in enough
        if (zoom.zoomLevel > 4) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, amp);
            ctx.lineTo(canvas.width, amp);
            ctx.stroke();
        }
        
        // Draw zoom level indicator
        if (zoom.zoomLevel > 1) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '10px monospace';
            ctx.fillText(`${zoom.zoomLevel.toFixed(1)}x`, canvas.width - 30, 15);
        }
        
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
            const relativePosition = x / rect.width;
            
            // Convert relative position to absolute position considering zoom
            const zoom = this.waveformZoom[this.editingPad];
            const viewWidth = zoom.viewEnd - zoom.viewStart;
            const absolutePosition = zoom.viewStart + (relativePosition * viewWidth);
            
            if (dragHandle === startHandle) {
                this.sampleParams[this.editingPad].trimStart = Math.min(absolutePosition, this.sampleParams[this.editingPad].trimEnd - 0.001);
            } else if (dragHandle === endHandle) {
                this.sampleParams[this.editingPad].trimEnd = Math.max(absolutePosition, this.sampleParams[this.editingPad].trimStart + 0.001);
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

    setupWaveformInteraction() {
        const canvas = document.getElementById('waveform-canvas');
        const container = document.querySelector('.waveform-container');
        
        // Mouse wheel zoom
        container.addEventListener('wheel', (e) => {
            if (!this.isEditMode || !this.samples[this.editingPad]) return;
            
            e.preventDefault();
            
            const rect = container.getBoundingClientRect();
            const centerPoint = (e.clientX - rect.left) / rect.width;
            const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
            
            this.zoomWaveform(this.editingPad, zoomFactor, centerPoint);
        });
        
        // Double-click to reset zoom
        canvas.addEventListener('dblclick', (e) => {
            if (!this.isEditMode || !this.samples[this.editingPad]) return;
            this.resetWaveformZoom(this.editingPad);
        });
        
        // Right-click context menu for waveform functions
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.isEditMode || !this.samples[this.editingPad]) return;
            
            const rect = container.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            const zoom = this.waveformZoom[this.editingPad];
            const actualPosition = zoom.viewStart + (zoom.viewEnd - zoom.viewStart) * position;
            
            // Snap trim handles to zero crossings when shift is held
            if (e.shiftKey) {
                const buffer = this.samples[this.editingPad];
                const samplePosition = actualPosition * buffer.length;
                const zeroPosition = this.findZeroCrossing(buffer, samplePosition);
                
                // Set closest trim handle to zero crossing
                const currentStart = this.sampleParams[this.editingPad].trimStart;
                const currentEnd = this.sampleParams[this.editingPad].trimEnd;
                
                if (Math.abs(zeroPosition - currentStart) < Math.abs(zeroPosition - currentEnd)) {
                    this.sampleParams[this.editingPad].trimStart = zeroPosition;
                } else {
                    this.sampleParams[this.editingPad].trimEnd = zeroPosition;
                }
                
                this.updateTrimHandles();
                this.updateTrimInfo();
            }
        });
    }

    updateTrimHandles() {
        const params = this.sampleParams[this.editingPad];
        const zoom = this.waveformZoom[this.editingPad];
        const startHandle = document.getElementById('start-handle');
        const endHandle = document.getElementById('end-handle');
        
        // Convert absolute trim positions to relative positions within the zoom view
        const viewWidth = zoom.viewEnd - zoom.viewStart;
        const startInView = (params.trimStart - zoom.viewStart) / viewWidth;
        const endInView = (params.trimEnd - zoom.viewStart) / viewWidth;
        
        // Show handles only if they're within the visible range
        const startVisible = params.trimStart >= zoom.viewStart && params.trimStart <= zoom.viewEnd;
        const endVisible = params.trimEnd >= zoom.viewStart && params.trimEnd <= zoom.viewEnd;
        
        startHandle.style.display = startVisible ? 'block' : 'none';
        endHandle.style.display = endVisible ? 'block' : 'none';
        
        if (startVisible) {
            startHandle.style.left = (startInView * 100) + '%';
        }
        
        if (endVisible) {
            endHandle.style.left = (endInView * 100) + '%';
            endHandle.style.transform = 'translateX(-100%)';
        }
        
        this.updateTrimOverlay();
    }

    updateTrimOverlay() {
        const params = this.sampleParams[this.editingPad];
        const zoom = this.waveformZoom[this.editingPad];
        const overlay = document.getElementById('trim-overlay');
        
        // Convert absolute trim positions to relative positions within the zoom view
        const viewWidth = zoom.viewEnd - zoom.viewStart;
        const startInView = Math.max(0, (params.trimStart - zoom.viewStart) / viewWidth);
        const endInView = Math.min(1, (params.trimEnd - zoom.viewStart) / viewWidth);
        
        const startPercent = startInView * 100;
        const endPercent = endInView * 100;
        
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
        
        document.getElementById('trim-start-value').textContent = startTime.toFixed(3);
        document.getElementById('trim-end-value').textContent = endTime.toFixed(3);
        document.getElementById('trim-length-value').textContent = length.toFixed(3);
    }

    zoomWaveform(padIndex, factor, centerPoint = 0.5) {
        if (!this.samples[padIndex]) return;
        
        const zoom = this.waveformZoom[padIndex];
        const oldZoomLevel = zoom.zoomLevel;
        const newZoomLevel = Math.max(1.0, Math.min(zoom.maxZoom, zoom.zoomLevel * factor));
        
        if (newZoomLevel === oldZoomLevel) return;
        
        const currentViewWidth = zoom.viewEnd - zoom.viewStart;
        const newViewWidth = currentViewWidth * (oldZoomLevel / newZoomLevel);
        
        const currentCenter = zoom.viewStart + currentViewWidth * centerPoint;
        const newViewStart = Math.max(0, Math.min(1 - newViewWidth, currentCenter - newViewWidth * centerPoint));
        const newViewEnd = newViewStart + newViewWidth;
        
        zoom.zoomLevel = newZoomLevel;
        zoom.viewStart = newViewStart;
        zoom.viewEnd = newViewEnd;
        
        this.drawWaveform();
        this.updateTrimHandles();
    }

    panWaveform(padIndex, direction) {
        if (!this.samples[padIndex]) return;
        
        const zoom = this.waveformZoom[padIndex];
        const viewWidth = zoom.viewEnd - zoom.viewStart;
        const panAmount = viewWidth * 0.1 * direction;
        
        const newViewStart = Math.max(0, Math.min(1 - viewWidth, zoom.viewStart + panAmount));
        const newViewEnd = newViewStart + viewWidth;
        
        zoom.viewStart = newViewStart;
        zoom.viewEnd = newViewEnd;
        
        this.drawWaveform();
        this.updateTrimHandles();
    }

    resetWaveformZoom(padIndex) {
        if (!this.samples[padIndex]) return;
        
        const zoom = this.waveformZoom[padIndex];
        zoom.zoomLevel = 1.0;
        zoom.viewStart = 0.0;
        zoom.viewEnd = 1.0;
        
        this.drawWaveform();
        this.updateTrimHandles();
    }

    findZeroCrossing(buffer, startSample, direction = 1) {
        const data = buffer.getChannelData(0);
        const length = data.length;
        let currentSample = Math.round(startSample);
        
        if (currentSample < 0 || currentSample >= length) return startSample;
        
        const startValue = data[currentSample];
        let lastValue = startValue;
        
        for (let i = 1; i < 1000 && currentSample + i * direction >= 0 && currentSample + i * direction < length; i++) {
            const sample = currentSample + i * direction;
            const value = data[sample];
            
            if ((lastValue >= 0 && value < 0) || (lastValue < 0 && value >= 0)) {
                return sample / length;
            }
            lastValue = value;
        }
        
        return startSample / length;
    }

    loadSequencePattern() {
        // Load the pattern for the currently selected pad
        const pattern = this.sequencePatterns[this.currentBank][this.selectedPad];
        const padSubdivision = this.sampleParams[this.selectedPad].subdivision;
        
        document.querySelectorAll('.step').forEach((step, index) => {
            // Reset all visual classes
            step.classList.remove('primary', 'secondary', 'disabled');
            
            const stepsPerSubdivision = 16 / padSubdivision; // How many visual steps per note
            const canBeActive = (index % stepsPerSubdivision) === 0;
            
            if (canBeActive) {
                // This step can be toggled - make it primary (emphasized)
                step.classList.add('primary');
                step.classList.toggle('active', pattern[index]);
            } else {
                // This step shows subdivision context - make it secondary (de-emphasized)
                step.classList.add('secondary');
                step.classList.remove('active');
            }
        });
    }

    recordPadHit(padIndex) {
        // Calculate current visual step and subdivision alignment
        const stepsPerBar = this.maxSubdivision * 4; // 128 substeps per bar
        const visualStep = Math.floor((this.subStep / (stepsPerBar / 16)) % 16);
        const padSubdivision = this.sampleParams[padIndex].subdivision;
        const visualStepsPerPadSubdivision = 16 / padSubdivision;
        const subsPerVisualStep = stepsPerBar / 16; // 8 substeps per visual step
        
        // Check if we're on a visual step boundary that aligns with this pad's subdivision
        if (this.subStep % subsPerVisualStep === 0 && visualStep % visualStepsPerPadSubdivision === 0) {
            // On-grid recording - record to the current visual step
            this.sequencePatterns[this.currentBank][padIndex][visualStep] = true;
            
            // Update visual if this pad is currently selected in sequencer mode
            if (this.isSequencerMode && this.selectedPad === padIndex) {
                const step = document.querySelector(`[data-step="${visualStep}"]`);
                if (step) {
                    step.classList.add('active');
                }
            }
        } else {
            // Off-grid recording (between subdivision boundaries)
            const offGridNote = {
                subStep: this.subStep,
                timestamp: Date.now()
            };
            this.offGridNotes[this.currentBank][padIndex].push(offGridNote);
        }
        
        // Update bank indicators
        this.updateBankIndicators();
    }

    setCurrentSubdivision(subdivision) {
        if ([4, 8, 16, 32].includes(subdivision)) {
            this.currentSubdivision = subdivision;
            
            // Update UI
            document.querySelectorAll('.subdivision-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.subdivision) === subdivision);
            });
            
            // Update the selected pad's subdivision
            if (this.isSequencerMode) {
                this.sampleParams[this.selectedPad].subdivision = subdivision;
                this.updateSequencerPadSelection(); // Refresh display
            }
        }
    }

    clearPattern() {
        // Clear the pattern for the currently selected pad
        this.sequencePatterns[this.currentBank][this.selectedPad].fill(false);
        // Clear off-grid notes for the currently selected pad
        this.offGridNotes[this.currentBank][this.selectedPad] = [];
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Update bank indicators
        this.updateBankIndicators();
    }

    switchBank(bankIndex) {
        if (bankIndex < 0 || bankIndex >= 4) return;
        
        this.currentBank = bankIndex;
        
        // Update bank selection UI
        document.querySelectorAll('.bank-btn').forEach((btn, index) => {
            btn.classList.toggle('active', index === bankIndex);
        });
        
        // Reload the current pattern if in sequencer mode
        if (this.isSequencerMode) {
            this.loadSequencePattern();
        }
    }

    copyPattern(fromBank, fromPad, toBank, toPad) {
        // Copy pattern from one bank/pad to another
        const sourcePattern = this.sequencePatterns[fromBank][fromPad];
        this.sequencePatterns[toBank][toPad] = [...sourcePattern];
        
        // Update visual if we're viewing the destination
        if (this.currentBank === toBank && this.selectedPad === toPad && this.isSequencerMode) {
            this.loadSequencePattern();
        }
        
        // Update bank indicators
        this.updateBankIndicators();
    }

    updateBankIndicators() {
        // Check each bank for patterns and update visual indicators
        document.querySelectorAll('.bank-btn').forEach((btn, bankIndex) => {
            let hasPatterns = false;
            
            // Check if any pad in this bank has any steps or off-grid notes
            for (let padIndex = 0; padIndex < 16; padIndex++) {
                if (this.sequencePatterns[bankIndex][padIndex].some(step => step) ||
                    this.offGridNotes[bankIndex][padIndex].length > 0) {
                    hasPatterns = true;
                    break;
                }
            }
            
            btn.classList.toggle('has-patterns', hasPatterns);
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

    setupADSRControl(paramName, min, max, step) {
        const knob = document.getElementById(`${paramName}-knob`);
        const knobContainer = document.getElementById(`${paramName}-knob-container`);
        const indicator = document.getElementById(`${paramName}-indicator`);
        const valueDisplay = document.getElementById(`${paramName}-value`);
        
        let isDragging = false;
        let startY = 0;
        let startValue = 0;
        let changeTimeout = null;
        let isAdjusting = false;

        // Update knob visual rotation based on value
        const updateKnobRotation = (value) => {
            // Map value to rotation angle (-135deg to +135deg, 270 degrees total)
            const normalizedValue = (value - min) / (max - min);
            const rotationAngle = -135 + (normalizedValue * 270);
            indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
        };

        // Regular input change handler
        knob.addEventListener('input', (e) => {
            if (!isDragging) {
                const value = parseFloat(e.target.value);
                this.sampleParams[this.editingPad][paramName] = value;
                valueDisplay.textContent = value.toFixed(2);
                updateKnobRotation(value);
                // Note: ADSR changes don't apply to currently playing samples since envelope is pre-scheduled
            }
        });

        // Enhanced gesture handling for mobile and desktop
        const startAdjustment = (clientY) => {
            isDragging = true;
            isAdjusting = true;
            startY = clientY;
            startValue = parseFloat(knob.value);
            knobContainer.classList.add('adjusting');
            
            // Haptic feedback on mobile
            if (navigator.vibrate) {
                navigator.vibrate(5);
            }
        };

        const updateValue = (clientY) => {
            if (!isDragging) return;
            
            const deltaY = startY - clientY;
            const sensitivity = window.innerWidth < 768 ? 0.01 : 0.02; // More sensitive on mobile
            const range = max - min;
            const valueChange = deltaY * sensitivity * range;
            const newValue = Math.max(min, Math.min(max, startValue + valueChange));
            
            if (Math.abs(newValue - parseFloat(knob.value)) > step / 2) {
                knob.value = newValue;
                this.sampleParams[this.editingPad][paramName] = newValue;
                valueDisplay.textContent = newValue.toFixed(2);
                updateKnobRotation(newValue);
                // Note: ADSR changes don't apply to currently playing samples since envelope is pre-scheduled
                
                // Subtle haptic feedback during adjustment
                if (navigator.vibrate && Math.abs(newValue - startValue) > range * 0.05) {
                    navigator.vibrate(2);
                }

                // Visual pulse effect
                knobContainer.classList.add('pulse');
                clearTimeout(changeTimeout);
                changeTimeout = setTimeout(() => {
                    knobContainer.classList.remove('pulse');
                }, 100);
            }
        };

        const endAdjustment = () => {
            if (!isDragging) return;
            
            isDragging = false;
            knobContainer.classList.remove('adjusting');
            
            setTimeout(() => {
                isAdjusting = false;
            }, 150);
        };

        // Mouse events for desktop - attach to knob container
        knobContainer.addEventListener('mousedown', (e) => {
            startAdjustment(e.clientY);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            updateValue(e.clientY);
        });

        document.addEventListener('mouseup', endAdjustment);

        // Touch events for mobile - attach to knob container
        knobContainer.addEventListener('touchstart', (e) => {
            startAdjustment(e.touches[0].clientY);
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                updateValue(e.touches[0].clientY);
                e.preventDefault();
            }
        });

        document.addEventListener('touchend', endAdjustment);

        // Initialize knob rotation
        updateKnobRotation(parseFloat(knob.value));
    }

    setupRadialKnob(paramName, min, max, step) {
        const knob = document.getElementById(`${paramName}-knob`);
        const knobContainer = document.getElementById(`${paramName}-knob-container`);
        const indicator = document.getElementById(`${paramName}-indicator`);
        const valueDisplay = document.getElementById(`${paramName}-value`);
        
        let isDragging = false;
        let startY = 0;
        let startValue = 0;
        let changeTimeout = null;
        let isAdjusting = false;

        // Update knob visual rotation based on value
        const updateKnobRotation = (value) => {
            // Map value to rotation angle (-135deg to +135deg, 270 degrees total)
            const normalizedValue = (value - min) / (max - min);
            const rotationAngle = -135 + (normalizedValue * 270);
            indicator.style.transform = `translateX(-50%) rotate(${rotationAngle}deg)`;
        };

        // Update value display based on parameter type
        const updateValueDisplay = (value) => {
            if (paramName === 'volume') {
                valueDisplay.textContent = value.toFixed(2);
            } else if (paramName === 'pitch') {
                const semitones = Math.round(12 * Math.log2(value));
                valueDisplay.textContent = semitones > 0 ? `+${semitones}` : semitones.toString();
            } else if (paramName === 'filter-freq') {
                valueDisplay.textContent = Math.round(value).toString();
            } else if (paramName === 'filter-res') {
                valueDisplay.textContent = value.toFixed(1);
            } else if (paramName === 'swing') {
                valueDisplay.textContent = Math.round(value).toString();
            } else {
                valueDisplay.textContent = value.toFixed(2);
            }
        };

        // Regular input change handler
        knob.addEventListener('input', (e) => {
            if (!isDragging) {
                const value = parseFloat(e.target.value);
                if (paramName === 'volume') {
                    this.sampleParams[this.editingPad].volume = value;
                    this.updateActiveAudioNodes(this.editingPad, 'volume', value);
                } else if (paramName === 'pitch') {
                    this.sampleParams[this.editingPad].pitch = value;
                    this.updateActiveAudioNodes(this.editingPad, 'pitch', value);
                } else if (paramName === 'filter-freq') {
                    this.sampleParams[this.editingPad].filterFreq = value;
                    this.updateActiveAudioNodes(this.editingPad, 'filterFreq', value);
                } else if (paramName === 'filter-res') {
                    this.sampleParams[this.editingPad].filterRes = value;
                    this.updateActiveAudioNodes(this.editingPad, 'filterRes', value);
                } else if (paramName === 'swing') {
                    this.sampleParams[this.editingPad].swing = value;
                }
                updateValueDisplay(value);
                updateKnobRotation(value);
            }
        });

        // Enhanced gesture handling for mobile and desktop
        const startAdjustment = (clientY) => {
            isDragging = true;
            isAdjusting = true;
            startY = clientY;
            startValue = parseFloat(knob.value);
            knobContainer.classList.add('adjusting');
            
            // Haptic feedback on mobile
            if (navigator.vibrate) {
                navigator.vibrate(5);
            }
        };

        const updateValue = (clientY) => {
            if (!isDragging) return;
            
            const deltaY = startY - clientY;
            const sensitivity = window.innerWidth < 768 ? 0.01 : 0.02; // More sensitive on mobile
            const range = max - min;
            const valueChange = deltaY * sensitivity * range;
            const newValue = Math.max(min, Math.min(max, startValue + valueChange));
            
            if (Math.abs(newValue - parseFloat(knob.value)) > step / 2) {
                knob.value = newValue;
                if (paramName === 'volume') {
                    this.sampleParams[this.editingPad].volume = newValue;
                    this.updateActiveAudioNodes(this.editingPad, 'volume', newValue);
                } else if (paramName === 'pitch') {
                    this.sampleParams[this.editingPad].pitch = newValue;
                    this.updateActiveAudioNodes(this.editingPad, 'pitch', newValue);
                } else if (paramName === 'filter-freq') {
                    this.sampleParams[this.editingPad].filterFreq = newValue;
                    this.updateActiveAudioNodes(this.editingPad, 'filterFreq', newValue);
                } else if (paramName === 'filter-res') {
                    this.sampleParams[this.editingPad].filterRes = newValue;
                    this.updateActiveAudioNodes(this.editingPad, 'filterRes', newValue);
                } else if (paramName === 'swing') {
                    this.sampleParams[this.editingPad].swing = newValue;
                }
                updateValueDisplay(newValue);
                updateKnobRotation(newValue);
                
                // Subtle haptic feedback during adjustment
                if (navigator.vibrate && Math.abs(newValue - startValue) > range * 0.05) {
                    navigator.vibrate(2);
                }

                // Visual pulse effect
                knobContainer.classList.add('pulse');
                clearTimeout(changeTimeout);
                changeTimeout = setTimeout(() => {
                    knobContainer.classList.remove('pulse');
                }, 100);
            }
        };

        const endAdjustment = () => {
            if (!isDragging) return;
            
            isDragging = false;
            knobContainer.classList.remove('adjusting');
            
            setTimeout(() => {
                isAdjusting = false;
            }, 150);
        };

        // Mouse events for desktop - attach to knob container
        knobContainer.addEventListener('mousedown', (e) => {
            startAdjustment(e.clientY);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            updateValue(e.clientY);
        });

        document.addEventListener('mouseup', endAdjustment);

        // Touch events for mobile - attach to knob container
        knobContainer.addEventListener('touchstart', (e) => {
            startAdjustment(e.touches[0].clientY);
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                updateValue(e.touches[0].clientY);
                e.preventDefault();
            }
        });

        document.addEventListener('touchend', endAdjustment);

        // Initialize knob rotation
        updateKnobRotation(parseFloat(knob.value));
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

    createMetronomeSound() {
        if (!this.audioContext) return;
        
        // Create a short click sound buffer
        const sampleRate = this.audioContext.sampleRate;
        const duration = 0.1; // 100ms click
        const bufferLength = sampleRate * duration;
        
        // Create two different pitched sounds - high for beat 1, lower for beats 2-4
        this.metronomeHighSound = this.audioContext.createBuffer(1, bufferLength, sampleRate);
        this.metronomeLowSound = this.audioContext.createBuffer(1, bufferLength, sampleRate);
        
        const highData = this.metronomeHighSound.getChannelData(0);
        const lowData = this.metronomeLowSound.getChannelData(0);
        
        // Generate click sounds with different frequencies
        for (let i = 0; i < bufferLength; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 20); // Quick decay
            
            // High pitch for first beat (1000Hz)
            highData[i] = Math.sin(2 * Math.PI * 1000 * t) * envelope * 0.3;
            
            // Lower pitch for other beats (600Hz)
            lowData[i] = Math.sin(2 * Math.PI * 600 * t) * envelope * 0.3;
        }
    }

    toggleMetronome() {
        this.metronomeEnabled = !this.metronomeEnabled;
        const metronomeBtn = document.getElementById('metronome-btn');
        metronomeBtn.classList.toggle('active', this.metronomeEnabled);
    }

    playMetronomeClick() {
        if ((!this.metronomeHighSound || !this.metronomeLowSound) || !this.audioContext) return;
        
        try {
            // Ensure audio context is ready
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            // Use high pitch for first beat (step 0, 4, 8, 12), low pitch for others
            const isFirstBeat = this.currentStep % 4 === 0;
            source.buffer = isFirstBeat ? this.metronomeHighSound : this.metronomeLowSound;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            gainNode.gain.value = 0.4;
            
            source.start();
        } catch (error) {
            console.error('Metronome playback error:', error);
        }
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