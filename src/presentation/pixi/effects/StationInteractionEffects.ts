import { Container, type DestroyOptions, type Ticker } from 'pixi.js'
import type { GameStateReader } from '@/game/domain/GameState'
import type { StationId } from '@/game/domain/Ids'
import { ActiveRouteStationOutlineEffect } from './ActiveRouteStationOutlineEffect'
import { StationPulseEffect } from './StationPulseEffect'
import { ValidRouteTargetEffect } from './ValidRouteTargetEffect'

export class StationInteractionEffects extends Container {
  private readonly stationPulse: StationPulseEffect
  private readonly activeRouteOutline: ActiveRouteStationOutlineEffect
  private readonly validRouteTarget: ValidRouteTargetEffect

  public constructor(state: GameStateReader, ticker: Ticker) {
    super()
    this.eventMode = 'none'

    this.stationPulse = new StationPulseEffect(state, ticker)
    this.activeRouteOutline = new ActiveRouteStationOutlineEffect(state, ticker)
    this.validRouteTarget = new ValidRouteTargetEffect(state, ticker)

    this.addChild(
      this.stationPulse,
      this.activeRouteOutline,
      this.validRouteTarget
    )
  }

  public showClickPulse(stationId: StationId, color: number): void {
    this.stationPulse.show(stationId, color)
  }

  public showConnectionPulse(stationId: StationId, color: number): void {
    this.stationPulse.show(stationId, color)
  }

  public showActiveRouteDrag(stationId: StationId, color: number): void {
    this.activeRouteOutline.start(stationId, color)
  }

  public addActiveRouteDragStation(stationId: StationId, color: number): void {
    this.activeRouteOutline.add(stationId, color)
  }

  public transferActiveRouteDrag(stationId: StationId, color: number): void {
    this.activeRouteOutline.transfer(stationId, color)
  }

  public finishActiveRouteDrag(): void {
    this.activeRouteOutline.finish()
  }

  public showValidTarget(stationId: StationId, color: number): void {
    this.validRouteTarget.show(stationId, color)
  }

  public clearValidTarget(): void {
    this.validRouteTarget.clear()
  }

  public clearAll(): void {
    this.stationPulse.clear()
    this.activeRouteOutline.clear()
    this.validRouteTarget.clear()
  }

  public override destroy(options?: DestroyOptions): void {
    this.clearAll()
    super.destroy(options)
  }
}
