import { Container, Graphics } from 'pixi.js'
import { StationType } from '@/constants/StationType'

export class Station extends Container {
  private static readonly SIZE = 16
  private static readonly TRIANGLE_SCALE = 4 / 3
  private static readonly FILL_COLOR = 0xeeeeee
  private static readonly BORDER_COLOR = 0x222222
  private static readonly BORDER_WIDTH = 5

  private static nextId = 1

  public readonly id = Station.nextId++

  private readonly shape = new Graphics()

  public constructor(
    x: number,
    y: number,
    public readonly stationType: StationType
  ) {
    super()

    this.position.set(x, y)

    this.eventMode = 'static'
    this.cursor = 'pointer'

    this.addChild(this.shape)
    this.draw()
  }

  private draw(): void {
    const size = Station.SIZE

    switch (this.stationType) {
      case StationType.Circle:
        this.shape.circle(0, 0, size)
        break

      case StationType.Triangle: {
        const triangleSize = size * Station.TRIANGLE_SCALE

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

    this.shape.fill(Station.FILL_COLOR).stroke({
      color: Station.BORDER_COLOR,
      width: Station.BORDER_WIDTH,
    })
  }
}
