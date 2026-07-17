import type { Point } from '@/engine/geometry/Point'
import type { SegmentRoutingPreference } from '@/game/domain/Route'

interface ConnectionCandidate {
  readonly points: readonly Point[]
  readonly startDirection: number
  readonly endDirection: number
}

export class OctilinearRouter {
  public static route(stations: readonly Point[]): readonly Point[] {
    const firstStation = stations[0]

    if (!firstStation) {
      return []
    }

    const points: Point[] = [firstStation]

    for (const segment of this.routeSegments(stations)) {
      for (let index = 1; index < segment.length; index++) {
        const point = segment[index]

        if (point) {
          points.push(point)
        }
      }
    }

    return points
  }

  public static routeSegments(
    stations: readonly Point[],
    preferences: readonly (SegmentRoutingPreference | undefined)[] = []
  ): readonly (readonly Point[])[] {
    const segments: Point[][] = []

    let previousDirection: number | null = null

    for (let index = 1; index < stations.length; index++) {
      const start = stations[index - 1]
      const end = stations[index]

      if (!start || !end) {
        continue
      }

      const candidates = this.createCandidates(start, end)

      const candidate = this.selectCandidate(
        candidates,
        previousDirection,
        preferences[index - 1]
      )

      segments.push([...candidate.points])
      previousDirection = candidate.endDirection
    }

    return segments
  }

  private static createCandidates(
    start: Point,
    end: Point
  ): readonly ConnectionCandidate[] {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y

    const absoluteX = Math.abs(deltaX)
    const absoluteY = Math.abs(deltaY)

    const directionX = Math.sign(deltaX)
    const directionY = Math.sign(deltaY)

    if (absoluteX === 0 || absoluteY === 0 || absoluteX === absoluteY) {
      return [this.createCandidate([start, end])]
    }

    const diagonalDistance = Math.min(absoluteX, absoluteY)

    const diagonalFirstBend: Point = {
      x: start.x + directionX * diagonalDistance,
      y: start.y + directionY * diagonalDistance,
    }

    let straightFirstBend: Point

    if (absoluteX > absoluteY) {
      straightFirstBend = {
        x: start.x + directionX * (absoluteX - absoluteY),
        y: start.y,
      }
    } else {
      straightFirstBend = {
        x: start.x,
        y: start.y + directionY * (absoluteY - absoluteX),
      }
    }

    return [
      this.createCandidate([start, diagonalFirstBend, end]),
      this.createCandidate([start, straightFirstBend, end]),
    ]
  }

  private static createCandidate(
    points: readonly Point[]
  ): ConnectionCandidate {
    const first = points[0]
    const second = points[1]
    const beforeLast = points.at(-2)
    const last = points.at(-1)

    if (!first || !second || !beforeLast || !last) {
      throw new Error('Invalid route candidate.')
    }

    return {
      points,
      startDirection: this.getDirection(first, second),
      endDirection: this.getDirection(beforeLast, last),
    }
  }

  private static selectCandidate(
    candidates: readonly ConnectionCandidate[],
    previousDirection: number | null,
    preference?: SegmentRoutingPreference
  ): ConnectionCandidate {
    const firstCandidate = candidates[0]

    if (!firstCandidate) {
      throw new Error('No route candidate available.')
    }

    if (preference) {
      const preferredCandidate =
        candidates[preference === 'diagonal-first' ? 0 : 1]

      if (preferredCandidate) {
        return preferredCandidate
      }
    }

    let selectedCandidate = firstCandidate
    let smallestScore = Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
      let score = 0

      if (previousDirection !== null) {
        score += this.getTurnCost(previousDirection, candidate.startDirection)
      }

      if (score < smallestScore) {
        smallestScore = score
        selectedCandidate = candidate
      }
    }

    return selectedCandidate
  }

  private static getDirection(start: Point, end: Point): number {
    const angle = Math.atan2(end.y - start.y, end.x - start.x)

    return (Math.round(angle / (Math.PI / 4)) + 8) % 8
  }

  private static getTurnCost(
    firstDirection: number,
    secondDirection: number
  ): number {
    const difference = Math.abs(firstDirection - secondDirection)

    return Math.min(difference, 8 - difference)
  }
}
