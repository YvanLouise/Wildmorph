export class LoopingMusic {
  private audio?: HTMLAudioElement;

  constructor(
    private readonly musicUrl: string,
    private readonly volume = 0.32,
  ) {}

  async start(): Promise<void> {
    if (!this.audio) {
      this.audio = new Audio(this.musicUrl);
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.volume = this.volume;
    }
    await this.audio.play().catch(() => undefined);
  }

  async pause(): Promise<void> {
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    await this.audio?.play().catch(() => undefined);
  }

  async stop(): Promise<void> {
    if (!this.audio) {
      return;
    }
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.src = '';
    this.audio.load();
    this.audio = undefined;
  }
}
