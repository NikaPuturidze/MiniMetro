import type { Point } from '@/engine/geometry/Point'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type { SegmentRoutingPreference, Route } from '@/game/domain/Route'
import type {
  RouteGeometryCandidate,
  RouteGeometryPolicy,
  RouteRoutingChoice,
} from '@/game/domain/RouteGeometryPolicy'
import { OctilinearRouter } from './OctilinearRouter'

interface TrackSpan {
  readonly routeId: RouteId
  readonly lineKey: string
  readonly minimum: number
  readonly maximum: number
}

export class OctilinearRouteGeometryPolicy implements RouteGeometryPolicy {
  public static readonly MAX_PARALLEL_ROUTES = 3

  public plan(
    candidate: RouteGeometryCandidate,
    state: GameStateReader
  ): readonly RouteRoutingChoice[] | null {
    const preferences = this.resolveFixedPreferences(candidate, state)

    if (this.isWithinParallelRouteLimit(candidate, preferences, state)) {
      return this.createRoutingChoices(
        candidate,
        preferences,
        candidate.flexibleSegmentIndices
      )
    }

    for (const assignment of this.createFlexibleAssignments(
      candidate.flexibleSegmentIndices.length
    )) {
      const assignedPreferences = [...preferences]

      candidate.flexibleSegmentIndices.forEach((segmentIndex, index) => {
        assignedPreferences[segmentIndex] = assignment[index]
      })

      if (
        !this.isWithinParallelRouteLimit(candidate, assignedPreferences, state)
      ) {
        continue
      }

      return this.createRoutingChoices(
        candidate,
        assignedPreferences,
        candidate.flexibleSegmentIndices
      )
    }

    return null
  }

  private createRoutingChoices(
    candidate: RouteGeometryCandidate,
    preferences: readonly (SegmentRoutingPreference | undefined)[],
    segmentIndices: readonly number[]
  ): readonly RouteRoutingChoice[] {
    return segmentIndices.flatMap(
      (segmentIndex): readonly RouteRoutingChoice[] => {
        const startStationId = candidate.stationIds[segmentIndex]
        const endStationId =
          segmentIndex === candidate.stationIds.length - 1 &&
          candidate.isCircular
            ? candidate.stationIds[0]
            : candidate.stationIds[segmentIndex + 1]
        const preference = preferences[segmentIndex]

        return startStationId === undefined ||
          endStationId === undefined ||
          preference === undefined
          ? []
          : [{ startStationId, endStationId, preference }]
      }
    )
  }

  private resolveFixedPreferences(
    candidate: RouteGeometryCandidate,
    state: GameStateReader
  ): (SegmentRoutingPreference | undefined)[] {
    const preferences = [...candidate.preferences]
    const route = state.getRoute(candidate.routeId)

    if (!route || route.isEmpty) {
      return preferences
    }

    const effectivePreferences = this.getEffectivePreferences(route, state)
    const flexibleIndices = new Set(candidate.flexibleSegmentIndices)

    preferences.forEach((preference, segmentIndex) => {
      if (preference !== undefined || flexibleIndices.has(segmentIndex)) {
        return
      }

      const startStationId = candidate.stationIds[segmentIndex]
      const endStationId =
        segmentIndex === candidate.stationIds.length - 1 && candidate.isCircular
          ? candidate.stationIds[0]
          : candidate.stationIds[segmentIndex + 1]

      if (startStationId === undefined || endStationId === undefined) {
        return
      }

      preferences[segmentIndex] = effectivePreferences.get(
        this.getSegmentKey(startStationId, endStationId)
      )
    })

    return preferences
  }

  private getEffectivePreferences(
    route: Route,
    state: GameStateReader
  ): ReadonlyMap<string, SegmentRoutingPreference> {
    const stationIds = route.getStationIds()
    const stations = stationIds.map((stationId) => state.getStation(stationId))

    if (stations.some((station) => station === undefined)) {
      return new Map()
    }

    const routedStations = route.isCircular
      ? [...(stations as Point[]), stations[0] as Point]
      : (stations as Point[])
    const preferences = routedStations
      .slice(1)
      .map((_, index) => route.getSegmentRoutingPreference(index))
    const segments = OctilinearRouter.routeSegments(routedStations, preferences)
    const effective = new Map<string, SegmentRoutingPreference>()

    segments.forEach((points, segmentIndex) => {
      if (preferences[segmentIndex] !== undefined) {
        effective.set(
          this.getSegmentKeyForRoute(route, segmentIndex),
          preferences[segmentIndex]
        )
        return
      }

      const preference = this.inferRoutingPreference(points)

      if (preference) {
        effective.set(
          this.getSegmentKeyForRoute(route, segmentIndex),
          preference
        )
      }
    })

    return effective
  }

  private isWithinParallelRouteLimit(
    candidate: RouteGeometryCandidate,
    preferences: readonly (SegmentRoutingPreference | undefined)[],
    state: GameStateReader
  ): boolean {
    const candidateSpans = this.createCandidateSpans(
      candidate,
      preferences,
      state
    )

    if (candidateSpans === null) {
      return false
    }

    const otherSpans = state
      .getRoutes()
      .filter(
        (route) => route.id !== candidate.routeId && route.stationCount >= 2
      )
      .flatMap((route) => this.createRouteSpans(route, state))
    const allSpans = [...candidateSpans, ...otherSpans]

    return candidateSpans.every(
      (candidateSpan) =>
        this.getMaximumOverlappingLaneCount(candidateSpan, allSpans) <
        OctilinearRouteGeometryPolicy.MAX_PARALLEL_ROUTES
    )
  }

  private createCandidateSpans(
    candidate: RouteGeometryCandidate,
    preferences: readonly (SegmentRoutingPreference | undefined)[],
    state: GameStateReader
  ): readonly TrackSpan[] | null {
    const stations = candidate.stationIds.map((stationId) =>
      state.getStation(stationId)
    )

    if (stations.some((station) => station === undefined)) {
      return null
    }

    const routedStations = candidate.isCircular
      ? [...(stations as Point[]), stations[0] as Point]
      : (stations as Point[])
    const segments = OctilinearRouter.routeSegments(routedStations, preferences)

    return segments.flatMap((points) =>
      this.createTrackSpans(candidate.routeId, points)
    )
  }

  private createRouteSpans(
    route: Route,
    state: GameStateReader
  ): readonly TrackSpan[] {
    const stationIds = route.getStationIds()
    const stations = stationIds
      .map((stationId) => state.getStation(stationId))
      .filter((station): station is NonNullable<typeof station> =>
        Boolean(station)
      )

    if (stations.length !== stationIds.length) {
      return []
    }

    const routedStations =
      route.isCircular && stations[0] ? [...stations, stations[0]] : stations
    const preferences = routedStations
      .slice(1)
      .map((_, index) => route.getSegmentRoutingPreference(index))
    const segments = OctilinearRouter.routeSegments(routedStations, preferences)

    return segments.flatMap((points) => this.createTrackSpans(route.id, points))
  }

  private createTrackSpans(
    routeId: RouteId,
    points: readonly Point[]
  ): readonly TrackSpan[] {
    const spans: TrackSpan[] = []

    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index]
      const end = points[index + 1]

      if (!start || !end) {
        continue
      }

      const span = this.createTrackSpan(routeId, start, end)

      if (span) {
        spans.push(span)
      }
    }

    return spans
  }

  private createTrackSpan(
    routeId: RouteId,
    start: Point,
    end: Point
  ): TrackSpan | null {
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const epsilon = 0.001

    if (Math.abs(deltaX) < epsilon && Math.abs(deltaY) < epsilon) {
      return null
    }

    let lineKey: string
    let startPosition: number
    let endPosition: number

    if (Math.abs(deltaY) < epsilon) {
      lineKey = `h:${this.getTrackCoordinateKey(start.y)}`
      startPosition = start.x
      endPosition = end.x
    } else if (Math.abs(deltaX) < epsilon) {
      lineKey = `v:${this.getTrackCoordinateKey(start.x)}`
      startPosition = start.y
      endPosition = end.y
    } else {
      const positiveSlope = Math.sign(deltaX) === Math.sign(deltaY)
      const invariant = positiveSlope ? start.y - start.x : start.y + start.x

      lineKey = `${positiveSlope ? 'd+' : 'd-'}:${this.getTrackCoordinateKey(
        invariant
      )}`
      startPosition = start.x
      endPosition = end.x
    }

    return {
      routeId,
      lineKey,
      minimum: Math.min(startPosition, endPosition),
      maximum: Math.max(startPosition, endPosition),
    }
  }

  private getMaximumOverlappingLaneCount(
    candidate: TrackSpan,
    allSpans: readonly TrackSpan[]
  ): number {
    const overlaps = allSpans
      .filter(
        (span) =>
          span !== candidate &&
          span.lineKey === candidate.lineKey &&
          Math.min(span.maximum, candidate.maximum) -
            Math.max(span.minimum, candidate.minimum) >
            0.001
      )
      .map((span) => ({
        minimum: Math.max(span.minimum, candidate.minimum),
        maximum: Math.min(span.maximum, candidate.maximum),
      }))
    const breakpoints = new Set<number>([candidate.minimum, candidate.maximum])

    overlaps.forEach((overlap) => {
      breakpoints.add(overlap.minimum)
      breakpoints.add(overlap.maximum)
    })

    const sortedBreakpoints = [...breakpoints].sort(
      (first, second) => first - second
    )
    let maximum = 0

    for (let index = 0; index < sortedBreakpoints.length - 1; index++) {
      const start = sortedBreakpoints[index]
      const end = sortedBreakpoints[index + 1]

      if (start === undefined || end === undefined || end - start <= 0.001) {
        continue
      }

      const midpoint = (start + end) / 2
      const laneCount = overlaps.filter(
        (overlap) =>
          overlap.minimum < midpoint && overlap.maximum > midpoint
      )

      maximum = Math.max(maximum, laneCount.length)
    }

    return maximum
  }

  private createFlexibleAssignments(
    segmentCount: number
  ): readonly (readonly SegmentRoutingPreference[])[] {
    const assignments: SegmentRoutingPreference[][] = []
    const assignmentCount = 2 ** segmentCount

    for (let mask = 0; mask < assignmentCount; mask++) {
      assignments.push(
        Array.from({ length: segmentCount }, (_, index) =>
          (mask & (1 << index)) === 0 ? 'diagonal-first' : 'straight-first'
        )
      )
    }

    return assignments
  }

  private inferRoutingPreference(
    points: readonly Point[]
  ): SegmentRoutingPreference | null {
    return points.length < 3
      ? null
      : this.isDiagonal(points[0] as Point, points[1] as Point)
        ? 'diagonal-first'
        : 'straight-first'
  }

  private isDiagonal(start: Point, end: Point): boolean {
    const deltaX = Math.abs(end.x - start.x)
    const deltaY = Math.abs(end.y - start.y)

    return deltaX > 0.001 && Math.abs(deltaX - deltaY) < 0.001
  }

  private getSegmentKeyForRoute(route: Route, segmentIndex: number): string {
    const segment = route.getSegmentStationIds(segmentIndex)

    return segment ? this.getSegmentKey(segment[0], segment[1]) : ''
  }

  private getSegmentKey(startId: StationId, endId: StationId): string {
    return `${startId}:${endId}`
  }

  private getTrackCoordinateKey(coordinate: number): number {
    return Math.round(coordinate * 1000)
  }
}
