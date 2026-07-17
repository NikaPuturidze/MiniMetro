import type { GameClock } from './GameClock'

export interface Tickable {
  update(deltaSeconds: number): void
}

export class GameEngine {
  private isRunning = false

  public constructor(
    private readonly clock: GameClock,
    private readonly systems: readonly Tickable[] = []
  ) {}

  public start(): void {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.clock.start(this.update)
  }

  public stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    this.clock.stop()
  }

  private readonly update = (deltaSeconds: number): void => {
    for (const system of this.systems) {
      system.update(deltaSeconds)
    }
  }
}
