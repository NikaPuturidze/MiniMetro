import { Container, Graphics } from 'pixi.js'
import { StationType } from '@/constants/StationType'
import type { StationId } from '@/game/domain/Ids'
import type { Station } from '@/game/domain/Station'
import {
  drawStationShapePath,
  STATION_BORDER_WIDTH,
  STATION_FILL_COLOR,
} from '../StationShapeGeometry'

export class StationView extends Container {
  private static readonly BORDER_COLOR = 0x222222

  private readonly shape = new Graphics()

  public constructor(
    public readonly stationId: StationId,
    station: Station
  ) {
    super()

    this.position.set(station.x, station.y)
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.addChild(this.shape)
    this.draw(station.stationType)
  }

  private draw(stationType: StationType): void {
    drawStationShapePath(this.shape, stationType)
      .fill(STATION_FILL_COLOR)
      .stroke({
        color: StationView.BORDER_COLOR,
        width: STATION_BORDER_WIDTH,
      })
  }
}
