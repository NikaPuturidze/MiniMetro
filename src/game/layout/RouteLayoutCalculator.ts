import type { Point } from '@/engine/geometry/Point'
import type { GameStateReader } from '@/game/domain/GameState'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type { Route } from '@/game/domain/Route'
import { OctilinearPort } from './OctilinearPort'
import { OctilinearRouter } from './OctilinearRouter'
import { PolylineOffset } from './PolylineOffset'
import type {
  RouteLayout,
  RouteSegmentLayout,
  TerminalLayout,
} from './RouteLayout'

interface CorridorUsage {
  readonly routeId: RouteId
  readonly segmentIndex: number
  readonly spanIndex: number
  readonly forward: boolean
}

interface TrackSpan extends CorridorUsage {
  readonly lineKey: string
  readonly minimum: number
  readonly maximum: number
}

interface RoutePorts {
  readonly start: number | null
  readonly end: number | null
}

interface TerminalUsage {
  readonly route: Route
  readonly incidentPort: number
  readonly lanePosition: number
  readonly previousPort: number | null
}

interface TerminalIncidentUsage {
  readonly port: number
  readonly lanePosition: number
}

interface TerminalAssignment {
  readonly ports: readonly number[]
  readonly score: readonly number[]
}

export class RouteLayoutCalculator {
  public static readonly LINE_WIDTH = 10
  public static readonly TERMINAL_EXTENSION = 48

  private static readonly LANE_SPACING = RouteLayoutCalculator.LINE_WIDTH
  private static readonly SAME_ROUTE_LANE_GAP = 4

  private static readonly TERMINAL_PORT_TIE_BREAK_PRIORITY = [
    6, 2, 4, 0, 5, 7, 3, 1,
  ]

  private readonly previousLayouts = new Map<RouteId, RouteLayout>()

  public calculateAll(
    state: GameStateReader,
    changedRouteId?: RouteId
  ): ReadonlyMap<RouteId, RouteLayout> {
    const activeRoutes = state.getRoutes().filter((route) => !route.isEmpty)
    const routeOrder = new Map<RouteId, number>()
    const centerSegmentsByRoute = new Map<
      RouteId,
      readonly (readonly Point[])[]
    >()

    state.getRoutes().forEach((route, index) => {
      routeOrder.set(route.id, index)
    })

    for (const route of activeRoutes) {
      centerSegmentsByRoute.set(route.id, this.getRoutedSegments(route, state))
    }

    const offsetsByRoute = this.calculateLaneOffsets(
      activeRoutes,
      centerSegmentsByRoute,
      routeOrder
    )
    const portsByRoute = this.calculateTerminalPorts(
      activeRoutes,
      centerSegmentsByRoute,
      offsetsByRoute,
      changedRouteId
    )
    const layouts = new Map<RouteId, RouteLayout>()

    for (const route of activeRoutes) {
      const centerSegments = centerSegmentsByRoute.get(route.id) ?? []
      const routeOffsets = offsetsByRoute.get(route.id) ?? []
      const segments: RouteSegmentLayout[] = centerSegments.map(
        (centerPoints, segmentIndex) => {
          const spanLaneOffsets = routeOffsets[segmentIndex] ?? []

          return {
            segmentIndex,
            centerPoints,
            points: PolylineOffset.calculate(centerPoints, spanLaneOffsets),
            spanLaneOffsets,
          }
        }
      )
      const ports = portsByRoute.get(route.id) ?? {
        start: null,
        end: null,
      }
      const layout = this.createRouteLayout(route, segments, ports, state)

      layouts.set(route.id, layout)
    }

    this.previousLayouts.clear()

    for (const [routeId, layout] of layouts) {
      this.previousLayouts.set(routeId, layout)
    }

    return layouts
  }

  public getRoutedSegments(
    route: Route,
    state: GameStateReader
  ): readonly (readonly Point[])[] {
    const routeStations = route
      .getStationIds()
      .map((stationId) => state.getStation(stationId))
      .filter((station) => station !== undefined)
    const stations =
      route.isCircular && routeStations[0]
        ? [...routeStations, routeStations[0]]
        : routeStations

    return OctilinearRouter.routeSegments(
      stations,
      stations
        .slice(1)
        .map((_, index) => route.getSegmentRoutingPreference(index))
    )
  }

  private calculateLaneOffsets(
    activeRoutes: readonly Route[],
    centerSegmentsByRoute: ReadonlyMap<RouteId, readonly (readonly Point[])[]>,
    routeOrder: ReadonlyMap<RouteId, number>
  ): Map<RouteId, number[][]> {
    const offsetsByRoute = new Map<RouteId, number[][]>()
    const prioritiesByRoute = new Map<RouteId, number[][]>()
    const trackSpans: TrackSpan[] = []

    for (const route of activeRoutes) {
      const centerSegments = centerSegmentsByRoute.get(route.id) ?? []
      // Prepending a station shifts every segment index. Preserve a lane only
      // when the same ordered centerline still exists, so the newly inserted
      // segment cannot inherit offsets from the route's former first segment.
      const previousOffsetsByGeometry =
        this.getPreviousOffsetsBySegmentGeometry(route.id)
      const offsets = centerSegments.map((points) => {
        const geometryKey = this.getSegmentGeometryKey(points)
        const matchingOffsets = previousOffsetsByGeometry
          .get(geometryKey)
          ?.shift()

        return points
          .slice(1)
          .map((_, spanIndex) => matchingOffsets?.[spanIndex] ?? 0)
      })
      const priorities = offsets.map((segment) =>
        new Array(segment.length).fill(0)
      )

      offsetsByRoute.set(route.id, offsets)
      prioritiesByRoute.set(route.id, priorities)

      centerSegments.forEach((points, segmentIndex) => {
        this.collectTrackSpans(trackSpans, route.id, segmentIndex, points)
      })
    }

    const groups = this.createTrackOverlapGroups(trackSpans)

    this.applyLaneOffsets(groups, offsetsByRoute, prioritiesByRoute, routeOrder)
    this.preserveLaneContinuityAtStations(
      activeRoutes,
      offsetsByRoute,
      prioritiesByRoute,
      new Set(activeRoutes.map((route) => route.id))
    )

    return offsetsByRoute
  }

  private getPreviousOffsetsBySegmentGeometry(
    routeId: RouteId
  ): Map<string, number[][]> {
    const offsetsByGeometry = new Map<string, number[][]>()
    const previousLayout = this.previousLayouts.get(routeId)

    for (const segment of previousLayout?.segments ?? []) {
      const geometryKey = this.getSegmentGeometryKey(segment.centerPoints)
      const matchingOffsets = offsetsByGeometry.get(geometryKey) ?? []

      matchingOffsets.push([...segment.spanLaneOffsets])
      offsetsByGeometry.set(geometryKey, matchingOffsets)
    }

    return offsetsByGeometry
  }

  private getSegmentGeometryKey(points: readonly Point[]): string {
    return points
      .map(
        (point) =>
          `${this.getTrackCoordinateKey(point.x)},${this.getTrackCoordinateKey(
            point.y
          )}`
      )
      .join(';')
  }

  private preserveLaneContinuityAtStations(
    activeRoutes: readonly Route[],
    offsetsByRoute: ReadonlyMap<RouteId, number[][]>,
    prioritiesByRoute: ReadonlyMap<RouteId, number[][]>,
    mutableRouteIds: ReadonlySet<RouteId>
  ): void {
    for (const route of activeRoutes) {
      if (!mutableRouteIds.has(route.id) || route.stationCount < 3) {
        continue
      }

      const offsets = offsetsByRoute.get(route.id)
      const priorities = prioritiesByRoute.get(route.id)

      if (!offsets || !priorities) {
        continue
      }

      for (
        let stationIndex = 1;
        stationIndex < route.stationCount - 1;
        stationIndex++
      ) {
        const incomingOffsets = offsets[stationIndex - 1]
        const outgoingOffsets = offsets[stationIndex]
        const incomingPriorities = priorities[stationIndex - 1]
        const outgoingPriorities = priorities[stationIndex]
        const incomingSpanIndex = (incomingOffsets?.length ?? 0) - 1

        if (
          !incomingOffsets ||
          !outgoingOffsets ||
          !incomingPriorities ||
          !outgoingPriorities ||
          incomingSpanIndex < 0 ||
          outgoingOffsets.length === 0
        ) {
          continue
        }

        // Extend a shared lane only through spans of the same routed segment.
        // The station hides any offset difference between adjacent segments;
        // copying across it would distort an otherwise unrelated bend.
        this.extendNearestSharedLaneToStation(
          incomingOffsets,
          incomingPriorities,
          false
        )
        this.extendNearestSharedLaneToStation(
          outgoingOffsets,
          outgoingPriorities,
          true
        )
      }
    }
  }

  private extendNearestSharedLaneToStation(
    offsets: number[],
    priorities: readonly number[],
    fromStart: boolean
  ): void {
    for (let step = 0; step < priorities.length; step++) {
      const index = fromStart ? step : priorities.length - step - 1

      if ((priorities[index] ?? 0) > 0) {
        const lane = offsets[index] ?? 0
        const stationSpanIndexes = fromStart
          ? Array.from({ length: index }, (_, spanIndex) => spanIndex)
          : Array.from(
              { length: priorities.length - index - 1 },
              (_, spanIndex) => priorities.length - spanIndex - 1
            )

        for (const stationSpanIndex of stationSpanIndexes) {
          offsets[stationSpanIndex] = lane
        }

        return
      }
    }
  }

  private collectTrackSpans(
    spans: TrackSpan[],
    routeId: RouteId,
    segmentIndex: number,
    points: readonly Point[]
  ): void {
    for (let spanIndex = 0; spanIndex < points.length - 1; spanIndex++) {
      const start = points[spanIndex]
      const end = points[spanIndex + 1]

      if (!start || !end) {
        continue
      }

      const span = this.createTrackSpan(
        routeId,
        segmentIndex,
        spanIndex,
        start,
        end
      )

      if (span) {
        spans.push(span)
      }
    }
  }

  private createTrackSpan(
    routeId: RouteId,
    segmentIndex: number,
    spanIndex: number,
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
    let forward: boolean

    if (Math.abs(deltaY) < epsilon) {
      lineKey = `h:${this.getTrackCoordinateKey(start.y)}`
      startPosition = start.x
      endPosition = end.x
      forward = deltaX > 0
    } else if (Math.abs(deltaX) < epsilon) {
      lineKey = `v:${this.getTrackCoordinateKey(start.x)}`
      startPosition = start.y
      endPosition = end.y
      forward = deltaY > 0
    } else {
      const positiveSlope = Math.sign(deltaX) === Math.sign(deltaY)
      const invariant = positiveSlope ? start.y - start.x : start.y + start.x

      lineKey = `${positiveSlope ? 'd+' : 'd-'}:${this.getTrackCoordinateKey(
        invariant
      )}`
      startPosition = start.x
      endPosition = end.x
      forward = deltaX > 0
    }

    return {
      routeId,
      segmentIndex,
      spanIndex,
      forward,
      lineKey,
      minimum: Math.min(startPosition, endPosition),
      maximum: Math.max(startPosition, endPosition),
    }
  }

  private createTrackOverlapGroups(
    spans: readonly TrackSpan[]
  ): readonly CorridorUsage[][] {
    const spansByLine = new Map<string, TrackSpan[]>()

    for (const span of spans) {
      const lineSpans = spansByLine.get(span.lineKey) ?? []

      lineSpans.push(span)
      spansByLine.set(span.lineKey, lineSpans)
    }

    const groups: CorridorUsage[][] = []

    for (const lineSpans of spansByLine.values()) {
      const breakpoints = new Set<number>()

      for (const span of lineSpans) {
        breakpoints.add(span.minimum)
        breakpoints.add(span.maximum)
      }

      const sortedBreakpoints = [...breakpoints].sort(
        (first, second) => first - second
      )
      const groupKeys = new Set<string>()

      for (let index = 0; index < sortedBreakpoints.length - 1; index++) {
        const start = sortedBreakpoints[index]
        const end = sortedBreakpoints[index + 1]

        if (start === undefined || end === undefined || end - start <= 0.001) {
          continue
        }

        const midpoint = (start + end) / 2
        const usages = lineSpans.filter(
          (span) => span.minimum < midpoint && span.maximum > midpoint
        )

        if (usages.length > 1) {
          const groupKey = usages
            .map(
              (usage) =>
                `${usage.routeId}:${usage.segmentIndex}:${usage.spanIndex}`
            )
            .sort()
            .join('|')

          if (!groupKeys.has(groupKey)) {
            groups.push(usages)
            groupKeys.add(groupKey)
          }
        }
      }
    }

    return groups
  }

  private applyLaneOffsets(
    groups: readonly CorridorUsage[][],
    offsetsByRoute: ReadonlyMap<RouteId, number[][]>,
    prioritiesByRoute: ReadonlyMap<RouteId, number[][]>,
    routeOrder: ReadonlyMap<RouteId, number>
  ): void {
    const orderedGroups = [...groups].sort(
      (first, second) => second.length - first.length
    )

    for (const sourceUsages of orderedGroups) {
      const usages = [...sourceUsages].sort((first, second) => {
        const previousOffsetDifference =
          this.getCanonicalLaneSortValue(
            first,
            offsetsByRoute,
            prioritiesByRoute
          ) -
          this.getCanonicalLaneSortValue(
            second,
            offsetsByRoute,
            prioritiesByRoute
          )

        return (
          previousOffsetDifference ||
          (routeOrder.get(first.routeId) ?? 0) -
            (routeOrder.get(second.routeId) ?? 0)
        )
      })
      const canonicalLaneOffsets =
        this.calculateCanonicalLaneOffsets(usages)

      usages.forEach((usage, lanePosition) => {
        const canonicalOffset = canonicalLaneOffsets[lanePosition] ?? 0
        const routeOffset = usage.forward ? canonicalOffset : -canonicalOffset
        const offsets = offsetsByRoute.get(usage.routeId)
        const priorities = prioritiesByRoute.get(usage.routeId)
        const currentPriority =
          priorities?.[usage.segmentIndex]?.[usage.spanIndex] ?? 0

        if (!offsets || !priorities || usages.length <= currentPriority) {
          return
        }

        const segmentOffsets = offsets[usage.segmentIndex]
        const segmentPriorities = priorities[usage.segmentIndex]

        if (!segmentOffsets || !segmentPriorities) {
          return
        }

        segmentOffsets[usage.spanIndex] = routeOffset
        segmentPriorities[usage.spanIndex] = usages.length
      })
    }
  }

  private calculateCanonicalLaneOffsets(
    usages: readonly CorridorUsage[]
  ): readonly number[] {
    const lanePositions = [0]

    for (let index = 1; index < usages.length; index++) {
      const previousUsage = usages[index - 1]
      const usage = usages[index]
      const sameRouteGap =
        previousUsage?.routeId === usage?.routeId
          ? RouteLayoutCalculator.SAME_ROUTE_LANE_GAP
          : 0

      lanePositions.push(
        (lanePositions[index - 1] ?? 0) +
          RouteLayoutCalculator.LANE_SPACING +
          sameRouteGap
      )
    }

    const center =
      ((lanePositions[0] ?? 0) + (lanePositions.at(-1) ?? 0)) / 2

    return lanePositions.map((position) => position - center)
  }

  private getCanonicalLaneSortValue(
    usage: CorridorUsage,
    offsetsByRoute: ReadonlyMap<RouteId, number[][]>,
    prioritiesByRoute: ReadonlyMap<RouteId, number[][]>
  ): number {
    const segmentOffsets =
      offsetsByRoute.get(usage.routeId)?.[usage.segmentIndex]
    const segmentPriorities =
      prioritiesByRoute.get(usage.routeId)?.[usage.segmentIndex]
    const previousSpanIndex = usage.spanIndex - 1
    const nextSpanIndex = usage.spanIndex + 1
    const adjacentRouteOffset =
      previousSpanIndex >= 0 &&
      (segmentPriorities?.[previousSpanIndex] ?? 0) > 0
        ? segmentOffsets?.[previousSpanIndex]
        : (segmentPriorities?.[nextSpanIndex] ?? 0) > 0
          ? segmentOffsets?.[nextSpanIndex]
          : undefined
    const routeOffset =
      adjacentRouteOffset ?? segmentOffsets?.[usage.spanIndex] ?? 0

    return usage.forward ? routeOffset : -routeOffset
  }

  private calculateTerminalPorts(
    activeRoutes: readonly Route[],
    centerSegmentsByRoute: ReadonlyMap<RouteId, readonly (readonly Point[])[]>,
    offsetsByRoute: ReadonlyMap<RouteId, readonly (readonly number[])[]>,
    changedRouteId?: RouteId
  ): Map<RouteId, RoutePorts> {
    const portsByRoute = new Map<RouteId, RoutePorts>()
    const stationIds = new Set<StationId>()

    for (const route of activeRoutes) {
      portsByRoute.set(route.id, { start: null, end: null })

      if (route.stationCount >= 2) {
        route.getStationIds().forEach((stationId) => stationIds.add(stationId))
      }
    }

    for (const stationId of stationIds) {
      const internalRoutes = activeRoutes.filter(
        (route) => route.stationCount >= 2 && route.isInternalStation(stationId)
      )
      const terminalRoutes = activeRoutes.filter(
        (route) =>
          route.stationCount >= 2 &&
          (route.isTerminalAt(stationId) ||
            route.getCircularClosureStationId() === stationId)
      )
      const usedPorts = new Set<number>()
      const incidentPortCounts = new Map<number, number>()
      const terminalUsages: TerminalUsage[] = []
      const incidentRoutes = new Set([...internalRoutes, ...terminalRoutes])

      for (const route of incidentRoutes) {
        for (const port of this.getIncidentPorts(
          route,
          stationId,
          centerSegmentsByRoute
        )) {
          const normalizedPort = this.normalizePort(port)

          incidentPortCounts.set(
            normalizedPort,
            (incidentPortCounts.get(normalizedPort) ?? 0) + 1
          )
        }
      }

      for (const route of incidentRoutes) {
        for (const port of this.getIncidentPorts(
          route,
          stationId,
          centerSegmentsByRoute
        )) {
          usedPorts.add(this.normalizePort(port))
        }
      }

      for (const route of terminalRoutes) {
        const incident = this.getTerminalIncidentUsage(
          route,
          stationId,
          centerSegmentsByRoute,
          offsetsByRoute
        )

        if (!incident) {
          throw new Error('Route terminal requires an incident port.')
        }

        terminalUsages.push({
          route,
          incidentPort: incident.port,
          lanePosition: incident.lanePosition,
          previousPort: this.getStablePreviousTerminalPort(
            route,
            stationId,
            incident.port
          ),
        })
      }

      const changedUsage = terminalUsages.find(
        (usage) =>
          usage.route.id === changedRouteId && usage.previousPort === null
      )

      const assignment = this.findTerminalAssignment(
        terminalUsages,
        usedPorts,
        incidentPortCounts,
        changedUsage ?? null
      )

      if (!assignment) {
        throw new Error('No terminal port is available.')
      }

      terminalUsages.forEach((usage, index) => {
        const port = assignment[index]

        if (port === undefined) {
          throw new Error('Route terminal requires an assigned port.')
        }

        this.assignTerminalPort(usage.route, stationId, port, portsByRoute)
      })
    }

    for (const route of activeRoutes) {
      if (route.stationCount !== 1) {
        continue
      }

      const stationId = route.getFirstStationId()
      const previous = this.previousLayouts.get(route.id)
      const port =
        previous?.startTerminal?.stationId === stationId
          ? previous.startTerminal.port
          : previous?.endTerminal?.stationId === stationId
            ? previous.endTerminal.port
            : 6

      portsByRoute.set(route.id, { start: port, end: null })
    }

    return portsByRoute
  }

  private findTerminalAssignment(
    usages: readonly TerminalUsage[],
    usedIncidentPorts: ReadonlySet<number>,
    incidentPortCounts: ReadonlyMap<number, number>,
    changedUsage: TerminalUsage | null
  ): readonly number[] | null {
    if (usages.length === 0) {
      return []
    }

    const availablePorts =
      RouteLayoutCalculator.TERMINAL_PORT_TIE_BREAK_PRIORITY.filter(
        (port) => !usedIncidentPorts.has(port)
      )

    if (availablePorts.length < usages.length) {
      return null
    }

    const result: { bestAssignment: TerminalAssignment | null } = {
      bestAssignment: null,
    }
    const assignedPorts = new Array<number>(usages.length)
    const claimedPorts = new Set<number>()

    const visit = (usageIndex: number): void => {
      if (usageIndex === usages.length) {
        const ports = [...assignedPorts]
        const score = this.scoreTerminalAssignment(
          usages,
          ports,
          incidentPortCounts,
          changedUsage
        )

        if (
          !result.bestAssignment ||
          this.compareTerminalAssignmentScores(
            score,
            result.bestAssignment.score
          ) < 0
        ) {
          result.bestAssignment = { ports, score }
        }

        return
      }

      for (const port of availablePorts) {
        if (claimedPorts.has(port)) {
          continue
        }

        assignedPorts[usageIndex] = port
        claimedPorts.add(port)
        visit(usageIndex + 1)
        claimedPorts.delete(port)
      }
    }

    visit(0)

    return result.bestAssignment?.ports ?? null
  }

  private scoreTerminalAssignment(
    usages: readonly TerminalUsage[],
    ports: readonly number[],
    incidentPortCounts: ReadonlyMap<number, number>,
    changedUsage: TerminalUsage | null
  ): readonly number[] {
    let orderInversions = 0
    let orderAmbiguities = 0
    let changedPortRank = 0
    let movedStableTerminals = 0
    let totalPortRank = 0

    for (let firstIndex = 0; firstIndex < usages.length; firstIndex++) {
      const firstUsage = usages[firstIndex]
      const firstPort = ports[firstIndex]

      if (!firstUsage || firstPort === undefined) {
        continue
      }

      const priority = this.getTerminalPortPriority(
        firstUsage.incidentPort,
        incidentPortCounts
      )
      const portRank = priority.indexOf(firstPort)

      totalPortRank += portRank === -1 ? priority.length : portRank

      if (firstUsage === changedUsage) {
        changedPortRank = portRank === -1 ? priority.length : portRank
      }

      if (
        firstUsage.previousPort !== null &&
        firstUsage.previousPort !== firstPort
      ) {
        movedStableTerminals++
      }

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < usages.length;
        secondIndex++
      ) {
        const secondUsage = usages[secondIndex]
        const secondPort = ports[secondIndex]

        if (
          !secondUsage ||
          secondPort === undefined ||
          this.normalizePort(firstUsage.incidentPort) !==
            this.normalizePort(secondUsage.incidentPort)
        ) {
          continue
        }

        const laneDifference =
          firstUsage.lanePosition - secondUsage.lanePosition

        if (Math.abs(laneDifference) < 0.001) {
          continue
        }

        const capDifference =
          this.getTerminalPortLateralPosition(
            firstUsage.incidentPort,
            firstPort
          ) -
          this.getTerminalPortLateralPosition(
            secondUsage.incidentPort,
            secondPort
          )

        if (Math.abs(capDifference) < 0.001) {
          orderAmbiguities++
        } else if (laneDifference * capDifference < 0) {
          orderInversions++
        }
      }
    }

    return [
      orderInversions,
      orderAmbiguities,
      changedPortRank,
      movedStableTerminals,
      totalPortRank,
      ...ports,
    ]
  }

  private compareTerminalAssignmentScores(
    first: readonly number[],
    second: readonly number[]
  ): number {
    const length = Math.max(first.length, second.length)

    for (let index = 0; index < length; index++) {
      const difference = (first[index] ?? 0) - (second[index] ?? 0)

      if (difference !== 0) {
        return difference
      }
    }

    return 0
  }

  private getTerminalPortLateralPosition(
    incidentPort: number,
    terminalPort: number
  ): number {
    const incidentDirection = OctilinearPort.getDirection(incidentPort)
    const terminalDirection = OctilinearPort.getDirection(terminalPort)
    const incidentNormal = {
      x: -incidentDirection.y,
      y: incidentDirection.x,
    }

    return (
      terminalDirection.x * incidentNormal.x +
      terminalDirection.y * incidentNormal.y
    )
  }

  private assignTerminalPort(
    route: Route,
    stationId: StationId,
    port: number,
    portsByRoute: Map<RouteId, RoutePorts>
  ): void {
    const current = portsByRoute.get(route.id) ?? {
      start: null,
      end: null,
    }
    const next = route.isCircular
      ? { start: current.start, end: port }
      : route.getFirstStationId() === stationId
        ? { start: port, end: current.end }
        : { start: current.start, end: port }

    portsByRoute.set(route.id, next)
  }

  private getStablePreviousTerminalPort(
    route: Route,
    stationId: StationId,
    incidentPort: number
  ): number | null {
    const previousLayout = this.previousLayouts.get(route.id)

    if (!previousLayout) {
      return null
    }

    const previousTerminal = route.isCircular
      ? previousLayout.endTerminal?.stationId === stationId
        ? previousLayout.endTerminal
        : null
      : route.getFirstStationId() === stationId
        ? previousLayout.startTerminal?.stationId === stationId
          ? previousLayout.startTerminal
          : null
        : previousLayout.endTerminal?.stationId === stationId
          ? previousLayout.endTerminal
          : null
    const previousIncidentPort = this.getLayoutTerminalIncidentPort(
      previousLayout,
      stationId
    )

    return previousTerminal &&
      previousIncidentPort !== null &&
      this.normalizePort(previousIncidentPort) ===
        this.normalizePort(incidentPort)
      ? previousTerminal.port
      : null
  }

  private getLayoutTerminalIncidentPort(
    layout: RouteLayout,
    stationId: StationId
  ): number | null {
    if (layout.startTerminal?.stationId === stationId) {
      const points = layout.segments[0]?.centerPoints
      const stationPoint = points?.[0]
      const nextPoint = points?.[1]

      return stationPoint && nextPoint
        ? OctilinearPort.fromVector({
            x: nextPoint.x - stationPoint.x,
            y: nextPoint.y - stationPoint.y,
          })
        : null
    }

    if (layout.endTerminal?.stationId === stationId) {
      const points = layout.segments.at(-1)?.centerPoints
      const firstPoint = points?.[0]
      const nextPoint = points?.[1]
      const stationPoint = points?.at(-1)
      const previousPoint = points?.at(-2)
      const terminalOrigin = layout.endTerminal.origin

      if (
        firstPoint &&
        nextPoint &&
        this.pointsMatch(firstPoint, terminalOrigin)
      ) {
        return OctilinearPort.fromVector({
          x: nextPoint.x - firstPoint.x,
          y: nextPoint.y - firstPoint.y,
        })
      }

      return stationPoint &&
        previousPoint &&
        this.pointsMatch(stationPoint, terminalOrigin)
        ? OctilinearPort.fromVector({
            x: previousPoint.x - stationPoint.x,
            y: previousPoint.y - stationPoint.y,
          })
        : null
    }

    return null
  }

  private getIncidentPorts(
    route: Route,
    stationId: StationId,
    centerSegmentsByRoute: ReadonlyMap<RouteId, readonly (readonly Point[])[]>
  ): readonly number[] {
    const stationIndex = route.getStationIds().indexOf(stationId)

    if (stationIndex === -1) {
      return []
    }

    const segments = centerSegmentsByRoute.get(route.id) ?? []
    const ports: number[] = []
    const previousSegmentIndex =
      stationIndex > 0
        ? stationIndex - 1
        : route.isCircular
          ? route.segmentCount - 1
          : null
    const nextSegmentIndex =
      stationIndex < route.stationCount - 1
        ? stationIndex
        : route.isCircular
          ? route.segmentCount - 1
          : null

    if (previousSegmentIndex !== null) {
      const previousSegment = segments[previousSegmentIndex]
      const stationPoint = previousSegment?.at(-1)
      const previousPoint = previousSegment?.at(-2)

      if (stationPoint && previousPoint) {
        ports.push(
          OctilinearPort.fromVector({
            x: previousPoint.x - stationPoint.x,
            y: previousPoint.y - stationPoint.y,
          })
        )
      }
    }

    if (nextSegmentIndex !== null) {
      const nextSegment = segments[nextSegmentIndex]
      const stationPoint = nextSegment?.[0]
      const nextPoint = nextSegment?.[1]

      if (stationPoint && nextPoint) {
        ports.push(
          OctilinearPort.fromVector({
            x: nextPoint.x - stationPoint.x,
            y: nextPoint.y - stationPoint.y,
          })
        )
      }
    }

    return ports
  }

  private getTerminalIncidentUsage(
    route: Route,
    stationId: StationId,
    centerSegmentsByRoute: ReadonlyMap<RouteId, readonly (readonly Point[])[]>,
    offsetsByRoute: ReadonlyMap<RouteId, readonly (readonly number[])[]>
  ): TerminalIncidentUsage | undefined {
    const stationIndex = route.getStationIds().indexOf(stationId)

    if (stationIndex === -1) {
      return undefined
    }

    const segments = centerSegmentsByRoute.get(route.id) ?? []
    const offsets = offsetsByRoute.get(route.id) ?? []
    const incidentUsages: TerminalIncidentUsage[] = []
    const previousSegmentIndex =
      stationIndex > 0
        ? stationIndex - 1
        : route.isCircular
          ? route.segmentCount - 1
          : null
    const nextSegmentIndex =
      stationIndex < route.stationCount - 1
        ? stationIndex
        : route.isCircular
          ? route.segmentCount - 1
          : null

    if (previousSegmentIndex !== null) {
      const previousSegment = segments[previousSegmentIndex]
      const stationPoint = previousSegment?.at(-1)
      const previousPoint = previousSegment?.at(-2)

      if (stationPoint && previousPoint) {
        incidentUsages.push({
          port: OctilinearPort.fromVector({
            x: previousPoint.x - stationPoint.x,
            y: previousPoint.y - stationPoint.y,
          }),
          // Polyline offsets are signed in route order. At the route's end,
          // the station-facing incident direction is reversed.
          lanePosition: -(offsets[previousSegmentIndex]?.at(-1) ?? 0),
        })
      }
    }

    if (nextSegmentIndex !== null) {
      const nextSegment = segments[nextSegmentIndex]
      const stationPoint = nextSegment?.[0]
      const nextPoint = nextSegment?.[1]

      if (stationPoint && nextPoint) {
        incidentUsages.push({
          port: OctilinearPort.fromVector({
            x: nextPoint.x - stationPoint.x,
            y: nextPoint.y - stationPoint.y,
          }),
          lanePosition: offsets[nextSegmentIndex]?.[0] ?? 0,
        })
      }
    }

    if (!route.isCircular) {
      return incidentUsages[0]
    }

    return route.getCircularClosureSourceTerminal() === 'start'
      ? incidentUsages.at(-1)
      : incidentUsages[0]
  }

  private getTerminalPortPriority(
    incidentPort: number,
    incidentPortCounts: ReadonlyMap<number, number>
  ): readonly number[] {
    const incomingPort = this.normalizePort(incidentPort)
    const oppositePort = this.normalizePort(incidentPort + 4)
    const availablePorts =
      RouteLayoutCalculator.TERMINAL_PORT_TIE_BREAK_PRIORITY.filter(
        (port) => port !== incomingPort
      )

    return availablePorts.sort((firstPort, secondPort) => {
      const loadDifference =
        this.getTerminalPortLoad(
          firstPort,
          incomingPort,
          oppositePort,
          incidentPortCounts
        ) -
        this.getTerminalPortLoad(
          secondPort,
          incomingPort,
          oppositePort,
          incidentPortCounts
        )
      const distanceDifference =
        this.getPortDistance(firstPort, oppositePort) -
        this.getPortDistance(secondPort, oppositePort)
      const cardinalDifference = (firstPort % 2) - (secondPort % 2)

      return loadDifference || distanceDifference || cardinalDifference
    })
  }

  private getTerminalPortLoad(
    port: number,
    incomingPort: number,
    oppositePort: number,
    incidentPortCounts: ReadonlyMap<number, number>
  ): number {
    const duplicatedIncomingPassages = Math.max(
      0,
      (incidentPortCounts.get(incomingPort) ?? 0) - 1
    )
    const continuationGapPenalty =
      this.normalizePort(port) === oppositePort
        ? duplicatedIncomingPassages
        : 0

    return (
      this.getLocalPortLoad(port, incidentPortCounts) + continuationGapPenalty
    )
  }

  private getLocalPortLoad(
    port: number,
    incidentPortCounts: ReadonlyMap<number, number>
  ): number {
    const exactLoad = incidentPortCounts.get(this.normalizePort(port)) ?? 0
    const previousLoad =
      incidentPortCounts.get(this.normalizePort(port - 1)) ?? 0
    const nextLoad = incidentPortCounts.get(this.normalizePort(port + 1)) ?? 0

    return exactLoad * 2 + previousLoad + nextLoad
  }

  private createRouteLayout(
    route: Route,
    segments: readonly RouteSegmentLayout[],
    ports: RoutePorts,
    state: GameStateReader
  ): RouteLayout {
    const firstStationId = route.getFirstStationId()
    const lastStationId = route.getLastStationId()
    const closureStationId = route.getCircularClosureStationId()
    const circularClosureTerminal =
      !route.isCircular || closureStationId === null || ports.end === null
        ? null
        : this.createTerminal(closureStationId, ports.end, state)
    const startTerminal =
      route.isCircular || firstStationId === null || ports.start === null
        ? null
        : this.createTerminal(firstStationId, ports.start, state)
    const endTerminal = route.isCircular
      ? circularClosureTerminal
      : route.stationCount < 2 || lastStationId === null || ports.end === null
        ? null
        : this.createTerminal(lastStationId, ports.end, state)

    return {
      routeId: route.id,
      segments,
      startTerminal,
      endTerminal,
    }
  }

  private createTerminal(
    stationId: StationId,
    port: number,
    state: GameStateReader
  ): TerminalLayout {
    const station = state.getStation(stationId)

    if (!station) {
      throw new Error(`Station ${stationId} does not exist.`)
    }

    const direction = OctilinearPort.getDirection(port)
    const origin: Point = { x: station.x, y: station.y }

    return {
      stationId,
      origin,
      direction,
      port,
      position: {
        x: station.x + direction.x * RouteLayoutCalculator.TERMINAL_EXTENSION,
        y: station.y + direction.y * RouteLayoutCalculator.TERMINAL_EXTENSION,
      },
    }
  }

  private getTrackCoordinateKey(coordinate: number): number {
    return Math.round(coordinate * 1000)
  }

  private pointsMatch(first: Point, second: Point): boolean {
    return Math.hypot(first.x - second.x, first.y - second.y) < 0.001
  }

  private getPortDistance(firstPort: number, secondPort: number): number {
    const difference = Math.abs(
      this.normalizePort(firstPort) - this.normalizePort(secondPort)
    )

    return Math.min(difference, 8 - difference)
  }

  private normalizePort(port: number): number {
    return ((port % 8) + 8) % 8
  }
}
