export class AmbienceAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: HTMLAudioElement;

  constructor(
    private readonly musicUrl: string,
    private readonly musicVolume = 0.38,
    private readonly footstepVolume = 0.38,
  ) {}

  async start(): Promise<void> {
    if (!this.music) {
      this.music = new Audio(this.musicUrl);
      this.music.loop = true;
      this.music.preload = 'auto';
      this.music.volume = this.musicVolume;
    }
    const musicPlayback = this.music.play().catch(() => undefined);

    try {
      if (!this.context) {
        const context = new AudioContext();
        const master = context.createGain();
        master.gain.value = this.footstepVolume;
        master.connect(context.destination);
        this.context = context;
        this.master = master;
      }
      await Promise.all([this.context.resume(), musicPlayback]);
    } catch {
      this.context = undefined;
      this.master = undefined;
    }
  }

  async pause(): Promise<void> {
    this.music?.pause();
    if (this.context?.state === 'running') {
      await this.context.suspend().catch(() => undefined);
    }
  }

  async resume(): Promise<void> {
    const musicPlayback = this.music?.play().catch(() => undefined);
    if (this.context?.state === 'suspended') {
      await this.context.resume().catch(() => undefined);
    }
    await musicPlayback;
  }

  async stop(): Promise<void> {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
      this.music.src = '';
      this.music.load();
    }
    this.music = undefined;
    if (this.context) {
      await this.context.close().catch(() => undefined);
    }
    this.context = undefined;
    this.master = undefined;
  }

  footstep(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') {
      return;
    }

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(92 + Math.random() * 14, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(48, context.currentTime + 0.075);
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    gain.gain.setValueAtTime(0.05, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
    oscillator.connect(filter).connect(gain).connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  }
}
