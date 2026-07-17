export type TickListener = (deltaSeconds: number) => void

export interface GameClock {
  start(listener: TickListener): void
  stop(): void
}
