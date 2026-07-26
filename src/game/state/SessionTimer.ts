export type Clock = () => number;

export function formatSessionElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(elapsedMs) ? elapsedMs / 1000 : 0));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const twoDigits = (value: number): string => String(value).padStart(2, '0');
  return hours > 0
    ? `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(totalMinutes)}:${twoDigits(seconds)}`;
}

export class SessionTimer {
  private elapsedMs = 0;
  private startedAt?: number;

  constructor(private readonly now: Clock = () => performance.now()) {}

  start(): void {
    if (this.startedAt === undefined) {
      this.startedAt = this.now();
    }
  }

  pause(): void {
    if (this.startedAt === undefined) return;
    this.elapsedMs += Math.max(0, this.now() - this.startedAt);
    this.startedAt = undefined;
  }

  reset(): void {
    this.elapsedMs = 0;
    this.startedAt = undefined;
  }

  getElapsedMs(): number {
    if (this.startedAt === undefined) return this.elapsedMs;
    return this.elapsedMs + Math.max(0, this.now() - this.startedAt);
  }
}
