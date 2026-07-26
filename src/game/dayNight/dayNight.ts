import type { DayNightConfig } from '../config/GameConfig';
import type { DayNightLighting, DayNightPhase, DayNightState } from '../types';

const MINUTE_SECONDS = 60;
const CLOCK_DAY_MINUTES = 24 * 60;

const CLOCK_RANGES: Readonly<Record<DayNightPhase, readonly [number, number]>> = {
  dawn: [5 * 60, 6 * 60],
  day: [6 * 60, 18 * 60],
  dusk: [18 * 60, 19 * 60],
  night: [19 * 60, 29 * 60],
};

const LIGHTING_COLORS = {
  day: [255, 255, 255],
  dawn: [116, 77, 57],
  dusk: [91, 54, 78],
  night: [14, 29, 52],
} as const;

interface PhaseSample {
  readonly phase: DayNightPhase;
  readonly progress: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothStep(value: number): number {
  const normalized = clamp01(value);
  return normalized * normalized * (3 - 2 * normalized);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function phaseSeconds(minutes: number): number {
  return Math.max(0.0001, minutes * MINUTE_SECONDS);
}

function phaseDurations(config: Readonly<DayNightConfig>): Readonly<Record<DayNightPhase, number>> {
  return {
    dawn: phaseSeconds(config.dawnDurationMinutes),
    day: phaseSeconds(config.dayDurationMinutes),
    dusk: phaseSeconds(config.duskDurationMinutes),
    night: phaseSeconds(config.nightDurationMinutes),
  };
}

export function dayNightCycleSeconds(config: Readonly<DayNightConfig>): number {
  const durations = phaseDurations(config);
  return durations.dawn + durations.day + durations.dusk + durations.night;
}

function resolvePhase(cycleSeconds: number, config: Readonly<DayNightConfig>): PhaseSample {
  const durations = phaseDurations(config);
  let remaining = cycleSeconds;
  for (const phase of ['dawn', 'day', 'dusk', 'night'] as const) {
    if (remaining < durations[phase]) {
      return { phase, progress: clamp01(remaining / durations[phase]) };
    }
    remaining -= durations[phase];
  }
  return { phase: 'night', progress: 1 };
}

function interpolateNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function interpolateColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  progress: number,
): readonly [number, number, number] {
  return [
    Math.round(interpolateNumber(from[0], to[0], progress)),
    Math.round(interpolateNumber(from[1], to[1], progress)),
    Math.round(interpolateNumber(from[2], to[2], progress)),
  ];
}

function toHex([red, green, blue]: readonly [number, number, number]): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function transitionLighting(
  progress: number,
  fromColor: readonly [number, number, number],
  middleColor: readonly [number, number, number],
  toColor: readonly [number, number, number],
  fromOpacity: number,
  middleOpacity: number,
  toOpacity: number,
): DayNightLighting {
  const firstHalf = progress < 0.5;
  const localProgress = smoothStep(firstHalf ? progress * 2 : (progress - 0.5) * 2);
  return {
    color: toHex(interpolateColor(firstHalf ? fromColor : middleColor, firstHalf ? middleColor : toColor, localProgress)),
    opacity: interpolateNumber(firstHalf ? fromOpacity : middleOpacity, firstHalf ? middleOpacity : toOpacity, localProgress),
  };
}

function lightingForPhase(
  phase: DayNightPhase,
  progress: number,
  nightDarkness: number,
): DayNightLighting {
  const darkness = clamp01(nightDarkness);
  if (phase === 'day') return { color: '#ffffff', opacity: 0 };
  if (phase === 'night') return { color: toHex(LIGHTING_COLORS.night), opacity: darkness };
  if (phase === 'dawn') {
    return transitionLighting(
      progress,
      LIGHTING_COLORS.night,
      LIGHTING_COLORS.dawn,
      LIGHTING_COLORS.day,
      darkness,
      darkness * 0.3,
      0,
    );
  }
  return transitionLighting(
    progress,
    LIGHTING_COLORS.day,
    LIGHTING_COLORS.dusk,
    LIGHTING_COLORS.night,
    0,
    darkness * 0.34,
    darkness,
  );
}

export function formatDayNightClock(clockMinutes: number): string {
  const wholeMinutes = Math.floor(positiveModulo(clockMinutes, CLOCK_DAY_MINUTES));
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function sampleDayNight(
  elapsedSeconds: number,
  config: Readonly<DayNightConfig>,
): DayNightState {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const cycleDuration = dayNightCycleSeconds(config);
  const cycleSeconds = positiveModulo(elapsed, cycleDuration);
  const { phase, progress } = resolvePhase(cycleSeconds, config);
  const [clockStart, clockEnd] = CLOCK_RANGES[phase];
  const clockMinutes = positiveModulo(interpolateNumber(clockStart, clockEnd, progress), CLOCK_DAY_MINUTES);

  return {
    elapsedSeconds: elapsed,
    phase,
    phaseProgress: progress,
    cycleProgress: cycleSeconds / cycleDuration,
    clockMinutes,
    clockText: formatDayNightClock(clockMinutes),
    lighting: lightingForPhase(phase, progress, config.nightDarkness),
  };
}

export function advanceDayNight(
  state: Readonly<DayNightState>,
  deltaMs: number,
  config: Readonly<DayNightConfig>,
): DayNightState {
  const deltaSeconds = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) / 1000 : 0;
  return sampleDayNight(state.elapsedSeconds + deltaSeconds, config);
}
