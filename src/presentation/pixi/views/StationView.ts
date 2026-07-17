import { Container, Graphics } from 'pixi.js'
import { StationType } from '@/constants/StationType'
import type { StationId } from '@/game/domain/Ids'
import type { Station } from '@/game/domain/Station'

export class StationView extends Container {
  private static readonly SIZE = 16
  private static readonly TRIANGLE_SCALE = 4 / 3
  private static readonly FILL_COLOR = 0xeeeeee
  private static readonly BORDER_COLOR = 0x222222
  private static readonly BORDER_WIDTH = 5

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
    const size = StationView.SIZE

    switch (stationType) {
      case StationType.Circle:
        this.shape.circle(0, 0, size)
        break

      case StationType.Triangle: {
        const triangleSize = size * StationView.TRIANGLE_SCALE
        const halfWidth = (Math.sqrt(3) / 2) * triangleSize
        const halfHeight = triangleSize / 2

        this.shape
          .moveTo(0, -triangleSize)
          .lineTo(halfWidth, halfHeight)
          .lineTo(-halfWidth, halfHeight)
          .closePath()
        break
      }

      case StationType.Rectangle:
        this.shape.rect(-size, -size, size * 2, size * 2)
        break
    }

    this.shape.fill(StationView.FILL_COLOR).stroke({
      color: StationView.BORDER_COLOR,
      width: StationView.BORDER_WIDTH,
    })
  }
}
