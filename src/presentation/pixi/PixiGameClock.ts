import type { Ticker } from 'pixi.js'
import type { GameClock, TickListener } from '@/engine/GameClock'

export class PixiGameClock implements GameClock {
  private listener: TickListener | null = null

  public constructor(private readonly ticker: Ticker) {}

  public start(listener: TickListener): void {
    if (this.listener) {
      return
    }

    this.listener = listener
    this.ticker.add(this.update)
  }

  public stop(): void {
    if (!this.listener) {
      return
    }

    this.ticker.remove(this.update)
    this.listener = null
  }

  private readonly update = (ticker: Ticker): void => {
    this.listener?.(ticker.deltaMS / 1000)
  }
}
