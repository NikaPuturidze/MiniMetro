export function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

export function easeOutQuadratic(value: number): number {
  return 1 - (1 - value) * (1 - value)
}

export function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}
