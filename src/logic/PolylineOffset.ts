import type { RoutePoint } from './OctilinearRouter'

export class PolylineOffset {
  public static calculate(
    points: readonly RoutePoint[],
    offset: number
  ): readonly RoutePoint[] {
    if (points.length < 2 || offset === 0) {
      return [...points]
    }

    return points.map((point, index) => {
      const previous = points[index - 1]
      const next = points[index + 1]

      if (!previous && next) {
        const normal = this.getNormal(point, next)

        return {
          x: point.x + normal.x * offset,
          y: point.y + normal.y * offset,
        }
      }

      if (previous && !next) {
        const normal = this.getNormal(previous, point)

        return {
          x: point.x + normal.x * offset,
          y: point.y + normal.y * offset,
        }
      }

      if (!previous || !next) {
        return point
      }

      const incomingNormal = this.getNormal(previous, point)
      const outgoingNormal = this.getNormal(point, next)

      const miterX = incomingNormal.x + outgoingNormal.x
      const miterY = incomingNormal.y + outgoingNormal.y
      const miterLength = Math.hypot(miterX, miterY)

      if (miterLength === 0) {
        return {
          x: point.x + incomingNormal.x * offset,
          y: point.y + incomingNormal.y * offset,
        }
      }

      const normalizedMiter = {
        x: miterX / miterLength,
        y: miterY / miterLength,
      }

      const denominator =
        normalizedMiter.x * outgoingNormal.x +
        normalizedMiter.y * outgoingNormal.y

      if (Math.abs(denominator) < 0.001) {
        return {
          x: point.x + outgoingNormal.x * offset,
          y: point.y + outgoingNormal.y * offset,
        }
      }

      const miterDistance = offset / denominator

      return {
        x: point.x + normalizedMiter.x * miterDistance,
        y: point.y + normalizedMiter.y * miterDistance,
      }
    })
  }

  private static getNormal(start: RoutePoint, end: RoutePoint): RoutePoint {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const length = Math.hypot(deltaX, deltaY)

    if (length === 0) {
      return { x: 0, y: 0 }
    }

    return {
      x: -deltaY / length,
      y: deltaX / length,
    }
  }
}
