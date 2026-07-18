import { Container, Graphics, type DestroyOptions, type Ticker } from 'pixi.js'
import type { StationType } from '@/constants/StationType'
import type { GameStateReader } from '@/game/domain/GameState'
import type { StationId } from '@/game/domain/Ids'
import {
  drawStationShapePath,
  STATION_BORDER_WIDTH,
} from '../StationShapeGeometry'

interface ValidTargetOutline {
  readonly stationId: StationId
  readonly color: number
  readonly graphics: Graphics
  readonly x: number
  readonly y: number
  readonly stationType: StationType
  elapsedSeconds: number
}

export class ValidRouteTargetEffect extends Container {
  private static readonly CYCLE_DURATION_SECONDS = 0.65

  private target: ValidTargetOutline | null = null
  private isTicking = false

  public constructor(
    private readonly state: GameStateReader,
    private readonly ticker: Ticker
  ) {
    super()
    this.eventMode = 'none'
  }

  public show(stationId: StationId, color: number): void {
    if (this.target?.stationId === stationId && this.target.color === color) {
      return
    }

    const station = this.state.getStation(stationId)

    if (!station) {
      this.clear()
      return
    }

    this.destroyTarget()

    const target: ValidTargetOutline = {
      stationId,
      color,
      graphics: new Graphics(),
      x: station.x,
      y: station.y,
      stationType: station.stationType,
      elapsedSeconds: 0,
    }

    this.target = target
    this.addChild(target.graphics)
    this.draw(target)
    this.updateTicker()
  }

  public clear(): void {
    this.destroyTarget()
    this.stopTicker()
  }

  public override destroy(options?: DestroyOptions): void {
    this.clear()
    super.destroy(options)
  }

  private readonly update = (ticker: Ticker): void => {
    if (!this.target) {
      this.updateTicker()
      return
    }

    this.target.elapsedSeconds += ticker.deltaMS / 1000
    this.draw(this.target)
    this.updateTicker()
  }

  private draw(target: ValidTargetOutline): void {
    const cycle =
      (target.elapsedSeconds % ValidRouteTargetEffect.CYCLE_DURATION_SECONDS) /
      ValidRouteTargetEffect.CYCLE_DURATION_SECONDS
    const breath = (Math.sin(cycle * Math.PI * 2 - Math.PI / 2) + 1) / 2
    const offset = 4 + breath * 2
    const width = 3

    target.graphics.clear().position.set(target.x, target.y)
    drawStationShapePath(
      target.graphics,
      target.stationType,
      STATION_BORDER_WIDTH / 2 + offset + width / 2
    ).stroke({
      color: target.color,
      width,
      alpha: 0.46 - breath * 0.18,
      join: 'round',
    })
  }

  private destroyTarget(): void {
    this.target?.graphics.destroy()
    this.target = null
  }

  private updateTicker(): void {
    if (this.target && !this.isTicking) {
      this.ticker.add(this.update)
      this.isTicking = true
    } else if (!this.target) {
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
