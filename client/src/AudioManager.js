export class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.bgmGain = null;
        
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.engineGain = null;
        this.engineFilter = null;

        this.driftNoise = null;
        this.driftGain = null;

        this.bgmTimer = null;
        this.bgmPlaying = false;
        this.noteIndex = 0;
        this.nextNoteTime = 0;
    }

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        this.ctx = new AudioContext();
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.ctx.destination);
        
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 1.0;
        this.sfxGain.connect(this.masterGain);
        
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.4;
        this.bgmGain.connect(this.masterGain);

        this._setupEngine();
        this._setupDrift();
        this._startBGM();
    }

    _setupEngine() {
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineGain.connect(this.sfxGain);

        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 400;
        this.engineFilter.connect(this.engineGain);

        this.engineOsc1 = this.ctx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc1.frequency.value = 50;
        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc1.start();

        this.engineOsc2 = this.ctx.createOscillator();
        this.engineOsc2.type = 'square';
        this.engineOsc2.frequency.value = 25; // sub octave
        this.engineOsc2.connect(this.engineFilter);
        this.engineOsc2.start();
    }

    _setupDrift() {
        this.driftGain = this.ctx.createGain();
        this.driftGain.gain.value = 0;
        this.driftGain.connect(this.sfxGain);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        filter.connect(this.driftGain);

        // Create white noise buffer for drift
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        this.driftNoise = this.ctx.createBufferSource();
        this.driftNoise.buffer = buffer;
        this.driftNoise.loop = true;
        this.driftNoise.connect(filter);
        this.driftNoise.start();
    }

    updateEngine(speed, maxSpeed, isDrifting) {
        if (!this.ctx || this.ctx.state !== 'running') return;

        const ratio = Math.abs(speed) / maxSpeed;
        const targetFreq = 40 + (ratio * 120);
        
        // Smoothly adjust pitch and volume
        this.engineOsc1.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        this.engineOsc2.frequency.setTargetAtTime(targetFreq * 0.5, this.ctx.currentTime, 0.1);
        this.engineFilter.frequency.setTargetAtTime(400 + (ratio * 1500), this.ctx.currentTime, 0.1);
        
        // Engine is louder when moving
        const targetVol = 0.1 + (ratio * 0.15);
        this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);

        // Drift squeal volume
        const driftVol = (isDrifting && ratio > 0.1) ? 0.2 : 0;
        this.driftGain.gain.setTargetAtTime(driftVol, this.ctx.currentTime, 0.1);
    }

    playCoin() {
        if (!this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(this.sfxGain);

        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(880, now); // A5
        osc.frequency.setValueAtTime(1318.51, now + 0.1); // E6

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    playCrash() {
        if (!this.ctx) return;
        this._playNoiseBurst(0.2, 500, 0.4);
    }

    playExplosion() {
        if (!this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Low boom
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 1.0);

        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

        osc.start(now);
        osc.stop(now + 1.0);

        // Noise crunch
        this._playNoiseBurst(0.8, 1000, 1.0);
    }

    _playNoiseBurst(duration, lowpassFreq, volume) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lowpassFreq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start();
    }

    // ========================================================================
    // BGM Sequencer
    // ========================================================================
    
    _startBGM() {
        this.bgmPlaying = true;
        this.noteIndex = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this._scheduleBGM();
    }

    _scheduleBGM() {
        if (!this.bgmPlaying) return;
        
        const scheduleAheadTime = 0.1;
        const secondsPerBeat = 60.0 / 120.0; // 120 BPM
        const noteLength = secondsPerBeat * 0.25; // 16th notes

        while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
            this._playBGMNote(this.nextNoteTime);
            this.nextNoteTime += noteLength;
            this.noteIndex++;
            if (this.noteIndex >= 16) this.noteIndex = 0;
        }

        this.bgmTimer = setTimeout(() => this._scheduleBGM(), 25);
    }

    _playBGMNote(time) {
        // Simple 4-on-the-floor Kick
        if (this.noteIndex % 4 === 0) {
            const kickOsc = this.ctx.createOscillator();
            const kickGain = this.ctx.createGain();
            
            kickOsc.connect(kickGain);
            kickGain.connect(this.bgmGain);
            
            kickOsc.frequency.setValueAtTime(150, time);
            kickOsc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
            
            kickGain.gain.setValueAtTime(0.8, time);
            kickGain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
            
            kickOsc.start(time);
            kickOsc.stop(time + 0.5);
        }

        // Offbeat Hi-hat (noise)
        if (this.noteIndex % 4 === 2) {
            const bufferSize = this.ctx.sampleRate * 0.05;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 5000;
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.bgmGain);
            
            noise.start(time);
        }

        // Synth Bass Arp
        const bassNotes = [32.7, 32.7, 39.2, 32.7,  32.7, 49.0, 32.7, 39.2,  
                           32.7, 32.7, 39.2, 32.7,  32.7, 49.0, 32.7, 39.2]; // C1, G1, C1, C1, D#1...
        
        if (bassNotes[this.noteIndex]) {
            const synthOsc = this.ctx.createOscillator();
            const synthGain = this.ctx.createGain();
            const synthFilter = this.ctx.createBiquadFilter();
            
            synthOsc.type = 'sawtooth';
            synthOsc.frequency.setValueAtTime(bassNotes[this.noteIndex], time);
            
            synthFilter.type = 'lowpass';
            synthFilter.frequency.setValueAtTime(400, time);
            synthFilter.frequency.exponentialRampToValueAtTime(50, time + 0.2);
            
            synthGain.gain.setValueAtTime(0.3, time);
            synthGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            
            synthOsc.connect(synthFilter);
            synthFilter.connect(synthGain);
            synthGain.connect(this.bgmGain);
            
            synthOsc.start(time);
            synthOsc.stop(time + 0.2);
        }
    }
}
