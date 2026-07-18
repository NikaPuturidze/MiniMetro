import { Container, Graphics, type DestroyOptions, type Ticker } from 'pixi.js'
import type { GameStateReader } from '@/game/domain/GameState'
import type { StationId } from '@/game/domain/Ids'
import { getStationOuterRadius } from '../StationShapeGeometry'
import {
  clampProgress,
  easeOutCubic,
  easeOutQuadratic,
} from './InteractionEffectEasing'

interface ClickPulse {
  readonly stationId: StationId
  readonly graphics: Graphics
  readonly color: number
  readonly x: number
  readonly y: number
  readonly baseRadius: number
  elapsedSeconds: number
}

export class StationPulseEffect extends Container {
  private static readonly DURATION_SECONDS = 0.5
  private static readonly RADIUS_SCALE = 3

  private pulses: ClickPulse[] = []
  private isTicking = false

  public constructor(
    private readonly state: GameStateReader,
    private readonly ticker: Ticker
  ) {
    super()
    this.eventMode = 'none'
  }

  public show(stationId: StationId, color: number): void {
    const station = this.state.getStation(stationId)

    if (!station) {
      return
    }

    this.removeAt(stationId)

    const pulse: ClickPulse = {
      stationId,
      graphics: new Graphics(),
      color,
      x: station.x,
      y: station.y,
      baseRadius: getStationOuterRadius(station.stationType),
      elapsedSeconds: 0,
    }

    this.pulses.push(pulse)
    this.addChild(pulse.graphics)
    this.draw(pulse)
    this.updateTicker()
  }

  public clear(): void {
    for (const pulse of this.pulses) {
      pulse.graphics.destroy()
    }

    this.pulses = []
    this.stopTicker()
  }

  public override destroy(options?: DestroyOptions): void {
    this.clear()
    super.destroy(options)
  }

  private readonly update = (ticker: Ticker): void => {
    const deltaSeconds = ticker.deltaMS / 1000
    const remaining: ClickPulse[] = []

    for (const pulse of this.pulses) {
      pulse.elapsedSeconds += deltaSeconds

      if (pulse.elapsedSeconds >= StationPulseEffect.DURATION_SECONDS) {
        pulse.graphics.destroy()
        continue
      }

      this.draw(pulse)
      remaining.push(pulse)
    }

    this.pulses = remaining
    this.updateTicker()
  }

  private draw(pulse: ClickPulse): void {
    const progress = clampProgress(
      pulse.elapsedSeconds / StationPulseEffect.DURATION_SECONDS
    )
    const expansionProgress =
      progress < 0.7
        ? easeOutCubic(progress / 0.7) * 10
        : 10 + easeOutCubic((progress - 0.7) / 0.3) * 4
    const alpha = 0.55 * (1 - easeOutQuadratic(progress))

    pulse.graphics
      .clear()
      .circle(
        pulse.x,
        pulse.y,
        (pulse.baseRadius + expansionProgress) * StationPulseEffect.RADIUS_SCALE
      )
      .fill({ color: pulse.color, alpha: alpha * 0.45 })
  }

  private removeAt(stationId: StationId): void {
    const remaining: ClickPulse[] = []

    for (const pulse of this.pulses) {
      if (pulse.stationId === stationId) {
        pulse.graphics.destroy()
      } else {
        remaining.push(pulse)
      }
    }

    this.pulses = remaining
  }

  private updateTicker(): void {
    if (this.pulses.length > 0 && !this.isTicking) {
      this.ticker.add(this.update)
      this.isTicking = true
    } else if (this.pulses.length === 0) {
      this.stopTicker()
    }
  }

  private stopTicker(): void {
    if (!this.isTicking) {
      return
    }

    this.ticker.remove(this.update)
    this.isTicking = false
  }
}
