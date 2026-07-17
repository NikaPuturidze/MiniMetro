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

export class RouteLayoutCalculator {
  public static readonly LINE_WIDTH = 10
  public static readonly TERMINAL_EXTENSION = 48

  private static readonly LANE_SPACING = RouteLayoutCalculator.LINE_WIDTH

  private static readonly TERMINAL_PORT_TIE_BREAK_PRIORITY = [
    6, 2, 4, 0, 5, 7, 3, 1,
  ]

  private readonly previousOffsets = new Map<RouteId, number[][]>()
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
      routeOrder,
      changedRouteId
    )
    const portsByRoute = this.calculateTerminalPorts(
      activeRoutes,
      centerSegmentsByRoute
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

    this.previousOffsets.clear()

    for (const [routeId, offsets] of offsetsByRoute) {
      this.previousOffsets.set(
        routeId,
        offsets.map((segment) => [...segment])
      )
    }

    return layouts
  }

  public getRoutedSegments(
    route: Route,
    state: GameStateReader
  ): readonly (readonly Point[])[] {
    const stations = route
      .getStationIds()
      .map((stationId) => state.getStation(stationId))
      .filter((station) => station !== undefined)

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
    routeOrder: ReadonlyMap<RouteId, number>,
    changedRouteId?: RouteId
  ): Map<RouteId, number[][]> {
    const offsetsByRoute = new Map<RouteId, number[][]>()
    const prioritiesByRoute = new Map<RouteId, number[][]>()
    const trackSpans: TrackSpan[] = []

    for (const route of activeRoutes) {
      const centerSegments = centerSegmentsByRoute.get(route.id) ?? []
      const previousRouteOffsets = this.previousOffsets.get(route.id) ?? []
      const isChanged = route.id === changedRouteId
      const offsets = centerSegments.map((points, segmentIndex) =>
        points.slice(1).map((_, spanIndex) => {
          if (isChanged) {
            return 0
          }

          return previousRouteOffsets[segmentIndex]?.[spanIndex] ?? 0
        })
      )
      const priorities = offsets.map((segment) =>
        new Array(segment.length).fill(0)
      )

      offsetsByRoute.set(route.id, offsets)
      prioritiesByRoute.set(route.id, priorities)

      centerSegments.forEach((points, segmentIndex) => {
        this.collectTrackSpans(trackSpans, route.id, segmentIndex, points)
      })
    }

    const mutableRouteIds =
      changedRouteId === undefined
        ? new Set(activeRoutes.map((route) => route.id))
        : new Set([changedRouteId])
    const groups = this.createTrackOverlapGroups(trackSpans)

    this.applyLaneOffsets(
      groups,
      offsetsByRoute,
      prioritiesByRoute,
      routeOrder,
      mutableRouteIds,
      activeRoutes.length
    )
    this.preserveLaneContinuityAtStations(
      activeRoutes,
      offsetsByRoute,
      prioritiesByRoute,
      mutableRouteIds
    )

    return offsetsByRoute
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

        const incomingLane = this.getNearestSharedLane(
          incomingOffsets,
          incomingPriorities,
          false
        )
        const outgoingLane = this.getNearestSharedLane(
          outgoingOffsets,
          outgoingPriorities,
          true
        )

        if (
          incomingLane !== null &&
          (incomingPriorities[incomingSpanIndex] ?? 0) === 0
        ) {
          incomingOffsets[incomingSpanIndex] = incomingLane
        }

        if (outgoingLane !== null && (outgoingPriorities[0] ?? 0) === 0) {
          outgoingOffsets[0] = outgoingLane
        }

        if (incomingLane === null && outgoingLane !== null) {
          incomingOffsets[incomingSpanIndex] = outgoingLane
        } else if (outgoingLane === null && incomingLane !== null) {
          outgoingOffsets[0] = incomingLane
        }
      }
    }
  }

  private getNearestSharedLane(
    offsets: readonly number[],
    priorities: readonly number[],
    fromStart: boolean
  ): number | null {
    for (let step = 0; step < priorities.length; step++) {
      const index = fromStart ? step : priorities.length - step - 1

      if ((priorities[index] ?? 0) > 0) {
        return offsets[index] ?? 0
      }
    }

    return null
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
      const visited = new Set<number>()

      for (let startIndex = 0; startIndex < lineSpans.length; startIndex++) {
        if (visited.has(startIndex)) {
          continue
        }

        const pending = [startIndex]
        const component: TrackSpan[] = []

        visited.add(startIndex)

        while (pending.length > 0) {
          const currentIndex = pending.pop()
          const current =
            currentIndex === undefined ? undefined : lineSpans[currentIndex]

          if (!current) {
            continue
          }

          component.push(current)

          lineSpans.forEach((candidate, candidateIndex) => {
            if (
              visited.has(candidateIndex) ||
              !this.trackSpansOverlap(current, candidate)
            ) {
              return
            }

            visited.add(candidateIndex)
            pending.push(candidateIndex)
          })
        }

        const usages: CorridorUsage[] = []

        for (const span of component) {
          if (
            !usages.some(
              (usage) =>
                usage.routeId === span.routeId &&
                usage.segmentIndex === span.segmentIndex &&
                usage.spanIndex === span.spanIndex
            )
          ) {
            usages.push(span)
          }
        }

        if (usages.length > 1) {
          groups.push(usages)
        }
      }
    }

    return groups
  }

  private trackSpansOverlap(first: TrackSpan, second: TrackSpan): boolean {
    return (
      first.routeId !== second.routeId &&
      Math.min(first.maximum, second.maximum) -
        Math.max(first.minimum, second.minimum) >
        0.001
    )
  }

  private applyLaneOffsets(
    groups: readonly CorridorUsage[][],
    offsetsByRoute: ReadonlyMap<RouteId, number[][]>,
    prioritiesByRoute: ReadonlyMap<RouteId, number[][]>,
    routeOrder: ReadonlyMap<RouteId, number>,
    mutableRouteIds: ReadonlySet<RouteId>,
    routeCount: number
  ): void {
    const orderedGroups = [...groups].sort(
      (first, second) => second.length - first.length
    )

    for (const sourceUsages of orderedGroups) {
      const usages = [...sourceUsages].sort(
        (first, second) =>
          (routeOrder.get(first.routeId) ?? 0) -
          (routeOrder.get(second.routeId) ?? 0)
      )
      const usedLaneIndices = new Set<number>()

      for (const usage of usages) {
        if (mutableRouteIds.has(usage.routeId)) {
          continue
        }

        const routeOffset =
          offsetsByRoute.get(usage.routeId)?.[usage.segmentIndex]?.[
            usage.spanIndex
          ] ?? 0
        const canonicalOffset = usage.forward ? routeOffset : -routeOffset

        usedLaneIndices.add(
          Math.round(canonicalOffset / RouteLayoutCalculator.LANE_SPACING)
        )
      }

      for (const usage of usages) {
        if (!mutableRouteIds.has(usage.routeId)) {
          continue
        }

        const laneIndex = this.findAvailableLaneIndex(
          usedLaneIndices,
          routeCount
        )
        const canonicalOffset = laneIndex * RouteLayoutCalculator.LANE_SPACING
        const routeOffset = usage.forward ? canonicalOffset : -canonicalOffset
        const offsets = offsetsByRoute.get(usage.routeId)
        const priorities = prioritiesByRoute.get(usage.routeId)
        const currentPriority =
          priorities?.[usage.segmentIndex]?.[usage.spanIndex] ?? 0

        if (!offsets || !priorities || usages.length <= currentPriority) {
          continue
        }

        const segmentOffsets = offsets[usage.segmentIndex]
        const segmentPriorities = priorities[usage.segmentIndex]

        if (!segmentOffsets || !segmentPriorities) {
          continue
        }

        segmentOffsets[usage.spanIndex] = routeOffset
        segmentPriorities[usage.spanIndex] = usages.length
        usedLaneIndices.add(laneIndex)
      }
    }
  }

  private findAvailableLaneIndex(
    usedLaneIndices: ReadonlySet<number>,
    routeCount: number
  ): number {
    if (!usedLaneIndices.has(0)) {
      return 0
    }

    for (let distance = 1; distance <= routeCount; distance++) {
      if (!usedLaneIndices.has(distance)) {
        return distance
      }

      if (!usedLaneIndices.has(-distance)) {
        return -distance
      }
    }

    throw new Error('No route lane is available.')
  }

  private calculateTerminalPorts(
    activeRoutes: readonly Route[],
    centerSegmentsByRoute: ReadonlyMap<RouteId, readonly (readonly Point[])[]>
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
        (route) => route.stationCount >= 2 && route.isTerminalAt(stationId)
      )
      const usedPorts = new Set<number>()

      for (const route of internalRoutes) {
        for (const port of this.getIncidentPorts(
          route,
          stationId,
          centerSegmentsByRoute
        )) {
          usedPorts.add(this.normalizePort(port))
        }
      }

      for (const route of terminalRoutes) {
        const incidentPort = this.getIncidentPorts(
          route,
          stationId,
          centerSegmentsByRoute
        )[0]

        if (incidentPort === undefined) {
          throw new Error('Route terminal requires an incident port.')
        }

        const availablePort =
          this.getTerminalPortPriority(incidentPort).find(
            (port) => !usedPorts.has(port)
          ) ?? null

        if (availablePort === null) {
          throw new Error('No terminal port is available.')
        }

        const current = portsByRoute.get(route.id) ?? {
          start: null,
          end: null,
        }
        const next =
          route.getFirstStationId() === stationId
            ? { start: availablePort, end: current.end }
            : { start: current.start, end: availablePort }

        usedPorts.add(availablePort)
        portsByRoute.set(route.id, next)
      }
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

    if (stationIndex > 0) {
      const previousSegment = segments[stationIndex - 1]
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

    if (stationIndex < route.stationCount - 1) {
      const nextSegment = segments[stationIndex]
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

  private getTerminalPortPriority(incidentPort: number): readonly number[] {
    const incomingPorts = new Set([
      this.normalizePort(incidentPort - 1),
      this.normalizePort(incidentPort),
      this.normalizePort(incidentPort + 1),
    ])
    const oppositePort = this.normalizePort(incidentPort + 4)
    const availablePorts =
      RouteLayoutCalculator.TERMINAL_PORT_TIE_BREAK_PRIORITY.filter(
        (port) => !incomingPorts.has(port)
      )
    const nearestCardinalDistance = Math.min(
      ...availablePorts
        .filter((port) => port % 2 === 0)
        .map((port) => this.getPortDistance(port, oppositePort))
    )

    return availablePorts.sort((firstPort, secondPort) => {
      const getPriority = (port: number): number => {
        if (port % 2 !== 0) {
          return 2
        }

        return this.getPortDistance(port, oppositePort) ===
          nearestCardinalDistance
          ? 1
          : 3
      }

      return getPriority(firstPort) - getPriority(secondPort)
    })
  }

  private createRouteLayout(
    route: Route,
    segments: readonly RouteSegmentLayout[],
    ports: RoutePorts,
    state: GameStateReader
  ): RouteLayout {
    const firstStationId = route.getFirstStationId()
    const lastStationId = route.getLastStationId()
    const startTerminal =
      firstStationId === null || ports.start === null
        ? null
        : this.createTerminal(firstStationId, ports.start, state)
    const endTerminal =
      route.stationCount < 2 || lastStationId === null || ports.end === null
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
