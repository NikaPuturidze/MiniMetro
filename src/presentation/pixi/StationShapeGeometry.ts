import type { Graphics } from 'pixi.js'
import { StationType } from '@/constants/StationType'

export const STATION_SIZE = 16
export const STATION_TRIANGLE_SCALE = 4 / 3
export const STATION_BORDER_WIDTH = 5

export function drawStationShapePath(
  graphics: Graphics,
  stationType: StationType,
  outwardOffset = 0
): Graphics {
  switch (stationType) {
    case StationType.Circle:
      return graphics.circle(0, 0, STATION_SIZE + outwardOffset)

    case StationType.Triangle: {
      const triangleSize =
        STATION_SIZE * STATION_TRIANGLE_SCALE + outwardOffset * 2
      const halfWidth = (Math.sqrt(3) / 2) * triangleSize
      const halfHeight = triangleSize / 2

      return graphics
        .moveTo(0, -triangleSize)
        .lineTo(halfWidth, halfHeight)
        .lineTo(-halfWidth, halfHeight)
        .closePath()
    }

    case StationType.Rectangle: {
      const halfSize = STATION_SIZE + outwardOffset

      return graphics.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2)
    }
  }
}

export function getStationOuterRadius(stationType: StationType): number {
  const borderHalfWidth = STATION_BORDER_WIDTH / 2

  switch (stationType) {
    case StationType.Circle:
      return STATION_SIZE + borderHalfWidth
    case StationType.Triangle:
      return STATION_SIZE * STATION_TRIANGLE_SCALE + STATION_BORDER_WIDTH
    case StationType.Rectangle:
      return Math.SQRT2 * (STATION_SIZE + borderHalfWidth)
  }
}
