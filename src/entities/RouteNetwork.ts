import { Container } from 'pixi.js'
import type { Station } from '@/entities/Station'
import { Route } from './Route'

interface CorridorUsage {
  readonly route: Route
  readonly segmentIndex: number
  readonly spanIndex: number
  readonly forward: boolean
}

interface TrackSpan extends CorridorUsage {
  readonly lineKey: string
  readonly minimum: number
  readonly maximum: number
}

export type RouteBuildResult =
  | {
      readonly status: 'connected'
      readonly route: Route
    }
  | {
      readonly status: 'removed'
      readonly route: Route
    }
  | {
      readonly status: 'no-available-route'
    }
  | {
      readonly status: 'station-capacity-reached'
    }
  | {
      readonly status: 'already-connected'
    }
  | {
      readonly status: 'invalid-terminal'
    }
  | {
      readonly status: 'middle-station-removal-not-allowed'
    }

export interface RouteTerminal {
  readonly route: Route
  readonly station: Station
}

export type AddStationResult =
  'added' | 'already-connected' | 'station-capacity-reached'

export class RouteNetwork extends Container {
  public static readonly MAX_ROUTES_PER_STATION = 3

  private static readonly LANE_SPACING = Route.LINE_WIDTH
  private static readonly TERMINAL_EDGE_INSET = 24

  private static readonly TERMINAL_PORT_TIE_BREAK_PRIORITY = [
    6, 2, 4, 0, 5, 7, 3, 1,
  ]

  private readonly routes: Route[] = []

  public constructor(routeColors: readonly number[]) {
    super()

    for (const color of routeColors) {
      this.createRoute(color)
    }
  }

  public createRoute(color: number): Route {
    const route = new Route(color)

    this.routes.push(route)
    this.addChild(route)

    return route
  }

  public getRoutes(): readonly Route[] {
    return this.routes
  }

  public getAvailableRoutes(): readonly Route[] {
    return this.routes.filter((route) => route.isEmpty)
  }

  public getRoutesForStation(station: Station): readonly Route[] {
    return this.routes.filter((route) => route.hasStation(station))
  }

  public peekAvailableRoute(): Route | null {
    return this.routes.find((route) => route.isEmpty) ?? null
  }

  public editRouteTerminal(
    route: Route,
    fromStation: Station,
    targetStation: Station
  ): RouteBuildResult {
    this.ensureRouteBelongsToNetwork(route)

    if (!route.isTerminalAt(fromStation)) {
      return {
        status: 'invalid-terminal',
      }
    }

    if (targetStation === fromStation) {
      route.removeTerminalStation(fromStation)
      this.updateRoutes(route)

      return {
        status: 'removed',
        route,
      }
    }

    const stations = route.getStations()

    const adjacentStation =
      route.getFirstStation() === fromStation ? stations[1] : stations.at(-2)

    if (adjacentStation === targetStation) {
      route.removeTerminalStation(fromStation)
      this.updateRoutes(route)

      return {
        status: 'removed',
        route,
      }
    }

    if (route.hasStation(targetStation)) {
      return {
        status: 'middle-station-removal-not-allowed',
      }
    }

    if (!this.canAttachRouteToStation(route, targetStation)) {
      return {
        status: 'station-capacity-reached',
      }
    }

    if (route.getFirstStation() === fromStation) {
      route.prependStation(targetStation)
    } else {
      route.appendStation(targetStation)
    }

    this.updateRoutes(route)

    return {
      status: 'connected',
      route,
    }
  }

  public createRouteBetween(start: Station, end: Station): RouteBuildResult {
    if (start === end) {
      return {
        status: 'already-connected',
      }
    }

    const route = this.peekAvailableRoute()

    if (!route) {
      return {
        status: 'no-available-route',
      }
    }

    if (
      !this.canAttachRouteToStation(route, start) ||
      !this.canAttachRouteToStation(route, end)
    ) {
      return {
        status: 'station-capacity-reached',
      }
    }

    route.appendStation(start)
    route.appendStation(end)

    this.updateRoutes(route)

    return {
      status: 'connected',
      route,
    }
  }

  public extendRoute(
    route: Route,
    fromStation: Station,
    targetStation: Station
  ): RouteBuildResult {
    this.ensureRouteBelongsToNetwork(route)

    if (!route.isTerminalAt(fromStation)) {
      return {
        status: 'invalid-terminal',
      }
    }

    if (route.hasStation(targetStation)) {
      return {
        status: 'already-connected',
      }
    }

    if (!this.canAttachRouteToStation(route, targetStation)) {
      return {
        status: 'station-capacity-reached',
      }
    }

    if (route.getFirstStation() === fromStation) {
      route.prependStation(targetStation)
    } else {
      route.appendStation(targetStation)
    }

    this.updateRoutes(route)

    return {
      status: 'connected',
      route,
    }
  }

  public findTerminalNear(
    point: { x: number; y: number },
    radius: number
  ): RouteTerminal | null {
    let nearestTerminal: RouteTerminal | null = null

    let nearestDistance = radius

    for (const route of this.routes) {
      if (route.stationCount === 0) {
        continue
      }

      const startPosition = route.getStartTerminalPosition()

      const startStation = route.getFirstStation()

      if (startPosition && startStation) {
        const distance = this.getTerminalEdgeDistance(
          point,
          startStation,
          startPosition
        )

        if (distance <= nearestDistance) {
          nearestDistance = distance
          nearestTerminal = {
            route,
            station: startStation,
          }
        }
      }

      const endPosition = route.getEndTerminalPosition()

      const endStation = route.getLastStation()

      if (endPosition && endStation) {
        const distance = this.getTerminalEdgeDistance(
          point,
          endStation,
          endPosition
        )

        if (distance <= nearestDistance) {
          nearestDistance = distance
          nearestTerminal = {
            route,
            station: endStation,
          }
        }
      }
    }

    return nearestTerminal
  }

  public addStationToRoute(route: Route, station: Station): AddStationResult {
    this.ensureRouteBelongsToNetwork(route)

    if (route.hasStation(station)) {
      return 'already-connected'
    }

    if (
      this.getRoutesForStation(station).length >=
      RouteNetwork.MAX_ROUTES_PER_STATION
    ) {
      return 'station-capacity-reached'
    }

    route.appendStation(station)
    this.updateRoutes(route)

    return 'added'
  }

  public insertStationIntoRoute(
    route: Route,
    segmentIndex: number,
    station: Station
  ): AddStationResult {
    this.ensureRouteBelongsToNetwork(route)

    if (route.hasStation(station)) {
      return 'already-connected'
    }

    const stations = route.getStations()

    if (!stations[segmentIndex] || !stations[segmentIndex + 1]) {
      throw new RangeError('Route segment index is outside the route.')
    }

    if (
      this.getRoutesForStation(station).length >=
      RouteNetwork.MAX_ROUTES_PER_STATION
    ) {
      return 'station-capacity-reached'
    }

    route.insertStation(segmentIndex + 1, station)
    this.updateRoutes(route)

    return 'added'
  }

  public removeStationFromRoute(route: Route, station: Station): void {
    this.ensureRouteBelongsToNetwork(route)

    route.removeStation(station)
    this.updateRoutes(route)
  }

  public clearRoute(route: Route): void {
    this.ensureRouteBelongsToNetwork(route)

    route.clearStations()
    this.updateRoutes(route)
  }

  public updateRoutes(changedRoute?: Route): void {
    for (const route of this.routes) {
      route.clear()
    }

    const activeRoutes = this.routes.filter((route) => !route.isEmpty)
    const mutableRoutes = new Set<Route>()

    for (const route of activeRoutes) {
      route.resetTerminalPorts()
    }

    if (changedRoute && activeRoutes.includes(changedRoute)) {
      mutableRoutes.add(changedRoute)
      changedRoute.setSegmentSpanLaneOffsets(
        changedRoute
          .getRoutedSegments()
          .map((points) => new Array(Math.max(points.length - 1, 0)).fill(0))
      )
    }

    this.updateSegmentLaneOffsets(activeRoutes, mutableRoutes)
    this.updateTerminalPorts(activeRoutes)

    for (const route of activeRoutes) {
      route.redraw()
    }
  }

  private canAttachRouteToStation(route: Route, station: Station): boolean {
    if (route.hasStation(station)) {
      return true
    }

    return (
      this.getRoutesForStation(station).length <
      RouteNetwork.MAX_ROUTES_PER_STATION
    )
  }

  private updateSegmentLaneOffsets(
    activeRoutes: readonly Route[],
    mutableRoutes: ReadonlySet<Route>
  ): void {
    const offsetsByRoute = new Map<Route, number[][]>()

    const lanePrioritiesByRoute = new Map<Route, number[][]>()

    const trackSpans: TrackSpan[] = []

    const routeOrder = new Map<Route, number>()

    this.routes.forEach((route, index) => {
      routeOrder.set(route, index)
    })

    for (const route of activeRoutes) {
      const stations = route.getStations()
      const routedSegments = route.getRoutedSegments()

      const offsets = routedSegments.map((points, segmentIndex) =>
        points
          .slice(1)
          .map((_, spanIndex) =>
            mutableRoutes.has(route)
              ? 0
              : route.getSpanLaneOffset(segmentIndex, spanIndex)
          )
      )

      const lanePriorities = offsets.map((segmentOffsets) =>
        new Array(segmentOffsets.length).fill(0)
      )

      offsetsByRoute.set(route, offsets)
      lanePrioritiesByRoute.set(route, lanePriorities)

      for (let index = 0; index < stations.length - 1; index++) {
        const start = stations[index]
        const end = stations[index + 1]

        if (!start || !end) {
          continue
        }

        const routedSegment = routedSegments[index]
        const firstPoint = routedSegment?.[0]
        const nextPoint = routedSegment?.[1]

        if (!firstPoint || !nextPoint) {
          continue
        }

        this.collectTrackSpans(trackSpans, route, index, routedSegment)
      }
    }

    const trackOverlapGroups = this.createTrackOverlapGroups(trackSpans)

    this.applyLaneOffsets(
      trackOverlapGroups,
      offsetsByRoute,
      lanePrioritiesByRoute,
      routeOrder,
      true,
      mutableRoutes
    )

    this.preserveLaneContinuityAtStations(
      activeRoutes,
      offsetsByRoute,
      lanePrioritiesByRoute,
      mutableRoutes
    )

    for (const [route, offsets] of offsetsByRoute) {
      route.setSegmentSpanLaneOffsets(offsets)
    }
  }

  private preserveLaneContinuityAtStations(
    activeRoutes: readonly Route[],
    offsetsByRoute: ReadonlyMap<Route, number[][]>,
    lanePrioritiesByRoute: ReadonlyMap<Route, number[][]>,
    mutableRoutes: ReadonlySet<Route>
  ): void {
    for (const route of activeRoutes) {
      if (!mutableRoutes.has(route) || route.stationCount < 3) {
        continue
      }

      const offsets = offsetsByRoute.get(route)
      const priorities = lanePrioritiesByRoute.get(route)

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
          incomingLane &&
          (incomingPriorities[incomingSpanIndex] ?? 0) === 0
        ) {
          incomingOffsets[incomingSpanIndex] = incomingLane.offset
        }

        if (outgoingLane && (outgoingPriorities[0] ?? 0) === 0) {
          outgoingOffsets[0] = outgoingLane.offset
        }

        if (!incomingLane && outgoingLane) {
          incomingOffsets[incomingSpanIndex] = outgoingLane.offset
          continue
        }

        if (!outgoingLane && incomingLane) {
          outgoingOffsets[0] = incomingLane.offset
        }
      }
    }
  }

  private getNearestSharedLane(
    offsets: readonly number[],
    priorities: readonly number[],
    fromStart: boolean
  ): { readonly offset: number } | null {
    for (let step = 0; step < priorities.length; step++) {
      const index = fromStart ? step : priorities.length - step - 1
      const priority = priorities[index] ?? 0

      if (priority > 0) {
        return {
          offset: offsets[index] ?? 0,
        }
      }
    }

    return null
  }

  private collectTrackSpans(
    spans: TrackSpan[],
    route: Route,
    segmentIndex: number,
    points: readonly { x: number; y: number }[]
  ): void {
    for (let spanIndex = 0; spanIndex < points.length - 1; spanIndex++) {
      const start = points[spanIndex]
      const end = points[spanIndex + 1]

      if (!start || !end) {
        continue
      }

      const span = this.createTrackSpan(
        route,
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
    route: Route,
    segmentIndex: number,
    spanIndex: number,
    start: { x: number; y: number },
    end: { x: number; y: number }
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

      lineKey = `${positiveSlope ? 'd+' : 'd-'}:${this.getTrackCoordinateKey(invariant)}`
      startPosition = start.x
      endPosition = end.x
      forward = deltaX > 0
    }

    return {
      route,
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
  ): ReadonlyMap<string, CorridorUsage[]> {
    const spansByLine = new Map<string, TrackSpan[]>()

    for (const span of spans) {
      const lineSpans = spansByLine.get(span.lineKey) ?? []

      lineSpans.push(span)
      spansByLine.set(span.lineKey, lineSpans)
    }

    const groups = new Map<string, CorridorUsage[]>()
    let groupIndex = 0

    for (const [lineKey, lineSpans] of spansByLine) {
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
                usage.route === span.route &&
                usage.segmentIndex === span.segmentIndex &&
                usage.spanIndex === span.spanIndex
            )
          ) {
            usages.push({
              route: span.route,
              segmentIndex: span.segmentIndex,
              spanIndex: span.spanIndex,
              forward: span.forward,
            })
          }
        }

        if (usages.length > 1) {
          groups.set(`${lineKey}:${groupIndex++}`, usages)
        }
      }
    }

    return groups
  }

  private trackSpansOverlap(first: TrackSpan, second: TrackSpan): boolean {
    if (first.route === second.route) {
      return false
    }

    return (
      Math.min(first.maximum, second.maximum) -
        Math.max(first.minimum, second.minimum) >
      0.001
    )
  }

  private getTrackCoordinateKey(coordinate: number): number {
    return Math.round(coordinate * 1000)
  }

  private applyLaneOffsets(
    groups: ReadonlyMap<string, CorridorUsage[]>,
    offsetsByRoute: ReadonlyMap<Route, number[][]>,
    lanePrioritiesByRoute: ReadonlyMap<Route, number[][]>,
    routeOrder: ReadonlyMap<Route, number>,
    reverseOffsetForOppositeDirection: boolean,
    mutableRoutes: ReadonlySet<Route>
  ): void {
    const orderedGroups = [...groups.values()].sort(
      (first, second) => second.length - first.length
    )

    for (const usages of orderedGroups) {
      if (usages.length < 2) {
        continue
      }

      usages.sort(
        (first, second) =>
          (routeOrder.get(first.route) ?? 0) -
          (routeOrder.get(second.route) ?? 0)
      )

      const usedLaneIndices = new Set<number>()

      for (const usage of usages) {
        if (mutableRoutes.has(usage.route)) {
          continue
        }

        const offsets = offsetsByRoute.get(usage.route)
        const routeOffset =
          offsets?.[usage.segmentIndex]?.[usage.spanIndex] ?? 0
        const canonicalOffset =
          reverseOffsetForOppositeDirection && !usage.forward
            ? -routeOffset
            : routeOffset

        usedLaneIndices.add(
          Math.round(canonicalOffset / RouteNetwork.LANE_SPACING)
        )
      }

      for (const usage of usages) {
        if (!mutableRoutes.has(usage.route)) {
          continue
        }

        const laneIndex = this.findAvailableLaneIndex(usedLaneIndices)
        const canonicalOffset = laneIndex * RouteNetwork.LANE_SPACING
        const routeOffset =
          reverseOffsetForOppositeDirection && !usage.forward
            ? -canonicalOffset
            : canonicalOffset

        const offsets = offsetsByRoute.get(usage.route)
        const lanePriorities = lanePrioritiesByRoute.get(usage.route)

        if (
          offsets &&
          lanePriorities &&
          usages.length >
            (lanePriorities[usage.segmentIndex]?.[usage.spanIndex] ?? 0)
        ) {
          const segmentOffsets = offsets[usage.segmentIndex]
          const segmentPriorities = lanePriorities[usage.segmentIndex]

          if (!segmentOffsets || !segmentPriorities) {
            continue
          }

          segmentOffsets[usage.spanIndex] = routeOffset
          segmentPriorities[usage.spanIndex] = usages.length
          usedLaneIndices.add(laneIndex)
        }
      }
    }
  }

  private findAvailableLaneIndex(usedLaneIndices: ReadonlySet<number>): number {
    if (!usedLaneIndices.has(0)) {
      return 0
    }

    for (let distance = 1; distance <= this.routes.length; distance++) {
      if (!usedLaneIndices.has(distance)) {
        return distance
      }

      if (!usedLaneIndices.has(-distance)) {
        return -distance
      }
    }

    throw new Error('No route lane is available.')
  }

  private updateTerminalPorts(activeRoutes: readonly Route[]): void {
    const stations = new Set<Station>()

    for (const route of activeRoutes) {
      if (route.stationCount < 2) {
        continue
      }

      for (const station of route.getStations()) {
        stations.add(station)
      }
    }

    for (const station of stations) {
      const internalRoutes = activeRoutes.filter(
        (route) => route.stationCount >= 2 && route.isInternalStation(station)
      )

      const terminalRoutes = activeRoutes.filter(
        (route) => route.stationCount >= 2 && route.isTerminalAt(station)
      )

      if (terminalRoutes.length === 0) {
        continue
      }

      const usedPorts = new Set<number>()

      for (const route of internalRoutes) {
        for (const port of route.getIncidentPorts(station)) {
          usedPorts.add(this.normalizePort(port))
        }
      }

      for (const route of terminalRoutes) {
        const incidentPort = route.getIncidentPorts(station)[0]

        if (incidentPort === undefined) {
          throw new Error('Route terminal requires an incident port.')
        }

        const terminalPortPriority = this.getTerminalPortPriority(incidentPort)

        const availablePort =
          terminalPortPriority.find((port) => !usedPorts.has(port)) ?? null

        if (availablePort === null) {
          throw new Error('No terminal port is available.')
        }

        usedPorts.add(availablePort)
        route.setTerminalPort(station, availablePort)
      }
    }
  }

  private getTerminalPortPriority(incidentPort: number): readonly number[] {
    const incomingPorts = new Set([
      this.normalizePort(incidentPort - 1),
      this.normalizePort(incidentPort),
      this.normalizePort(incidentPort + 1),
    ])
    const oppositePort = this.normalizePort(incidentPort + 4)
    const availablePorts = RouteNetwork.TERMINAL_PORT_TIE_BREAK_PRIORITY.filter(
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

  private getPortDistance(firstPort: number, secondPort: number): number {
    const difference = Math.abs(
      this.normalizePort(firstPort) - this.normalizePort(secondPort)
    )

    return Math.min(difference, 8 - difference)
  }

  private normalizePort(port: number): number {
    return ((port % 8) + 8) % 8
  }

  private getTerminalEdgeDistance(
    point: { x: number; y: number },
    station: Station,
    terminal: { x: number; y: number }
  ): number {
    const deltaX = terminal.x - station.x
    const deltaY = terminal.y - station.y
    const length = Math.hypot(deltaX, deltaY)

    if (length === 0) {
      return Number.POSITIVE_INFINITY
    }

    const start = {
      x: station.x + (deltaX / length) * RouteNetwork.TERMINAL_EDGE_INSET,
      y: station.y + (deltaY / length) * RouteNetwork.TERMINAL_EDGE_INSET,
    }

    const terminalVectorX = terminal.x - start.x
    const terminalVectorY = terminal.y - start.y
    const terminalLengthSquared =
      terminalVectorX * terminalVectorX + terminalVectorY * terminalVectorY

    const projection =
      ((point.x - start.x) * terminalVectorX +
        (point.y - start.y) * terminalVectorY) /
      terminalLengthSquared

    const clampedProjection = Math.max(0, Math.min(1, projection))
    const closestPoint = {
      x: start.x + terminalVectorX * clampedProjection,
      y: start.y + terminalVectorY * clampedProjection,
    }

    return Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y)
  }

  private ensureRouteBelongsToNetwork(route: Route): void {
    if (!this.routes.includes(route)) {
      throw new Error('Route does not belong to this network.')
    }
  }
}
