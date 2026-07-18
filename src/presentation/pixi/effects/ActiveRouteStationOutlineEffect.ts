import { Container, Graphics, type DestroyOptions, type Ticker } from 'pixi.js'
import type { GameStateReader } from '@/game/domain/GameState'
import type { StationId } from '@/game/domain/Ids'
import {
  drawStationShapePath,
  STATION_BORDER_WIDTH,
} from '../StationShapeGeometry'
import {
  clampProgress,
  easeInOutCubic,
  easeOutCubic,
} from './InteractionEffectEasing'

interface ActiveOutline {
  readonly stationId: StationId
  readonly color: number
  readonly graphics: Graphics
  phase: 'entering' | 'active' | 'exiting'
  elapsedSeconds: number
}

export class ActiveRouteStationOutlineEffect extends Container {
  private static readonly TRANSITION_DURATION_SECONDS = 0.26
  private static readonly OVERSHOOT_SCALE = 1.25
  private static readonly ENTER_PEAK_PROGRESS = 0.6
  private static readonly EXIT_PEAK_PROGRESS = 0.35

  private readonly outlines = new Map<StationId, ActiveOutline>()
  private isTicking = false

  public constructor(
    private readonly state: GameStateReader,
    private readonly ticker: Ticker
  ) {
    super()
    this.eventMode = 'none'
  }

  public start(stationId: StationId, color: number): void {
    this.clear()
    this.add(stationId, color)
  }

  public add(stationId: StationId, color: number): void {
    const existing = this.outlines.get(stationId)

    if (existing?.color === color && existing.phase !== 'exiting') {
      return
    }

    this.destroyAt(stationId)

    const outline: ActiveOutline = {
      stationId,
      color,
      graphics: new Graphics(),
      phase: 'entering',
      elapsedSeconds: 0,
    }

    this.outlines.set(stationId, outline)
    this.addChild(outline.graphics)
    this.draw(outline)
    this.updateTicker()
  }

  public transfer(stationId: StationId, color: number): void {
    this.clear()
    this.add(stationId, color)
  }

  public finish(): void {
    for (const outline of this.outlines.values()) {
      if (outline.phase === 'exiting') {
        continue
      }

      outline.phase = 'exiting'
      outline.elapsedSeconds = 0
    }

    this.updateTicker()
  }

  public clear(): void {
    for (const outline of this.outlines.values()) {
      outline.graphics.destroy()
    }

    this.outlines.clear()
    this.stopTicker()
  }

  public override destroy(options?: DestroyOptions): void {
    this.clear()
    super.destroy(options)
  }

  private readonly update = (ticker: Ticker): void => {
    const deltaSeconds = ticker.deltaMS / 1000

    for (const outline of this.outlines.values()) {
      outline.elapsedSeconds += deltaSeconds

      if (
        outline.phase === 'entering' &&
        outline.elapsedSeconds >=
          ActiveRouteStationOutlineEffect.TRANSITION_DURATION_SECONDS
      ) {
        outline.phase = 'active'
        outline.elapsedSeconds = 0
      } else if (
        outline.phase === 'exiting' &&
        outline.elapsedSeconds >=
          ActiveRouteStationOutlineEffect.TRANSITION_DURATION_SECONDS
      ) {
        this.destroyAt(outline.stationId)
        continue
      }

      this.draw(outline)
    }

    this.updateTicker()
  }

  private draw(outline: ActiveOutline): void {
    const station = this.state.getStation(outline.stationId)

    if (!station) {
      this.destroyAt(outline.stationId)
      return
    }

    const width = this.getWidth(outline)

    outline.graphics.clear().position.set(station.x, station.y)
    drawStationShapePath(
      outline.graphics,
      station.stationType,
      STATION_BORDER_WIDTH / 2 + width / 2
    ).stroke({
      color: outline.color,
      width,
      alpha: 0.9,
      join: 'round',
    })
  }

  private getWidth(outline: ActiveOutline): number {
    if (outline.phase === 'active') {
      return STATION_BORDER_WIDTH
    }

    const progress = clampProgress(
      outline.elapsedSeconds /
        ActiveRouteStationOutlineEffect.TRANSITION_DURATION_SECONDS
    )
    const overshoot = ActiveRouteStationOutlineEffect.OVERSHOOT_SCALE

    if (outline.phase === 'entering') {
      const peakProgress = ActiveRouteStationOutlineEffect.ENTER_PEAK_PROGRESS
      const scale =
        progress <= peakProgress
          ? overshoot * easeOutCubic(progress / peakProgress)
          : overshoot -
            (overshoot - 1) *
              easeInOutCubic((progress - peakProgress) / (1 - peakProgress))

      return STATION_BORDER_WIDTH * scale
    }

    const peakProgress = ActiveRouteStationOutlineEffect.EXIT_PEAK_PROGRESS
    const scale =
      progress <= peakProgress
        ? 1 + (overshoot - 1) * easeInOutCubic(progress / peakProgress)
        : overshoot *
          (1 - easeInOutCubic((progress - peakProgress) / (1 - peakProgress)))

    return STATION_BORDER_WIDTH * scale
  }

  private destroyAt(stationId: StationId): void {
    this.outlines.get(stationId)?.graphics.destroy()
    this.outlines.delete(stationId)
  }

  private updateTicker(): void {
    const shouldTick = [...this.outlines.values()].some(
      (outline) => outline.phase !== 'active'
    )

    if (shouldTick && !this.isTicking) {
      this.ticker.add(this.update)
      this.isTicking = true
    } else if (!shouldTick) {
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
