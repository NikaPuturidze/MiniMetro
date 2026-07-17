import type { RoutePoint } from './OctilinearRouter'

export class PolylineOffset {
  public static calculate(
    points: readonly RoutePoint[],
    offsets: number | readonly number[]
  ): readonly RoutePoint[] {
    if (points.length < 2) {
      return [...points]
    }

    const spanOffsets =
      typeof offsets === 'number'
        ? new Array(points.length - 1).fill(offsets)
        : offsets

    const offsetLines = points.slice(1).map((end, spanIndex) => {
      const start = points[spanIndex]

      if (!start) {
        return null
      }

      const normal = this.getNormal(start, end)
      const offset = spanOffsets[spanIndex] ?? 0

      return {
        start: {
          x: start.x + normal.x * offset,
          y: start.y + normal.y * offset,
        },
        end: {
          x: end.x + normal.x * offset,
          y: end.y + normal.y * offset,
        },
      }
    })

    const firstLine = offsetLines[0]
    const lastLine = offsetLines.at(-1)

    if (!firstLine || !lastLine) {
      return [...points]
    }

    const result: RoutePoint[] = [firstLine.start]

    for (let pointIndex = 1; pointIndex < points.length - 1; pointIndex++) {
      const incoming = offsetLines[pointIndex - 1]
      const outgoing = offsetLines[pointIndex]

      if (!incoming || !outgoing) {
        continue
      }

      result.push(this.intersectLines(incoming, outgoing))
    }

    result.push(lastLine.end)

    return result
  }

  private static intersectLines(
    first: { start: RoutePoint; end: RoutePoint },
    second: { start: RoutePoint; end: RoutePoint }
  ): RoutePoint {
    const firstDirection = {
      x: first.end.x - first.start.x,
      y: first.end.y - first.start.y,
    }
    const secondDirection = {
      x: second.end.x - second.start.x,
      y: second.end.y - second.start.y,
    }
    const denominator =
      firstDirection.x * secondDirection.y -
      firstDirection.y * secondDirection.x

    if (Math.abs(denominator) < 0.001) {
      return {
        x: (first.end.x + second.start.x) / 2,
        y: (first.end.y + second.start.y) / 2,
      }
    }

    const delta = {
      x: second.start.x - first.start.x,
      y: second.start.y - first.start.y,
    }
    const distance =
      (delta.x * secondDirection.y - delta.y * secondDirection.x) / denominator

    return {
      x: first.start.x + firstDirection.x * distance,
      y: first.start.y + firstDirection.y * distance,
    }
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
