import { Container } from 'pixi.js'
import type { Station } from '@/entities/Station'
import { Route } from './Route'
import { OctilinearPort } from '@/logic/OctilinearPort'
import { OctilinearRouter } from '@/logic/OctilinearRouter'

interface CorridorUsage {
  readonly route: Route
  readonly segmentIndex: number
  readonly forward: boolean
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

  /* Adjacent Mini Metro route lanes meet edge-to-edge without a gap. */
  private static readonly LANE_SPACING = Route.LINE_WIDTH
  /* Starts outside a station's hit area, preserving station clicks. */
  private static readonly TERMINAL_EDGE_INSET = 24

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

    /*
     * Mini Metro's endpoint-removal gesture drops a terminal handle back
     * onto the station it currently belongs to.  Remove that endpoint so
     * the route retracts to its previous station.
     */
    if (targetStation === fromStation) {
      route.removeTerminalStation(fromStation)
      this.updateRoutes()

      return {
        status: 'removed',
        route,
      }
    }

    const stations = route.getStations()

    const adjacentStation =
      route.getFirstStation() === fromStation ? stations[1] : stations.at(-2)

    /*
     * Dragging a terminal onto its adjacent station
     * removes the original terminal station.
     */
    if (adjacentStation === targetStation) {
      route.removeTerminalStation(fromStation)
      this.updateRoutes()

      return {
        status: 'removed',
        route,
      }
    }

    /*
     * The target is already somewhere else inside the
     * route. Removing or bypassing middle stations is
     * deliberately prohibited.
     */
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

    this.updateRoutes()

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

    this.updateRoutes()

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

    this.updateRoutes()

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
    this.updateRoutes()

    return 'added'
  }

  public removeStationFromRoute(route: Route, station: Station): void {
    this.ensureRouteBelongsToNetwork(route)

    route.removeStation(station)
    this.updateRoutes()
  }

  public clearRoute(route: Route): void {
    this.ensureRouteBelongsToNetwork(route)

    route.clearStations()
    this.updateRoutes()
  }

  public updateRoutes(): void {
    /*
     * Clearing every graphic first also removes visuals left behind by a
     * route that just became available.
     */
    for (const route of this.routes) {
      route.clear()
    }

    const activeRoutes = this.routes.filter((route) => !route.isEmpty)

    for (const route of activeRoutes) {
      route.resetTerminalPorts()

      route.setSegmentLaneOffsets(
        new Array(Math.max(route.stationCount - 1, 0)).fill(0)
      )
    }

    this.updateSegmentLaneOffsets(activeRoutes)
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

  private updateSegmentLaneOffsets(activeRoutes: readonly Route[]): void {
    const offsetsByRoute = new Map<Route, number[]>()

    const corridorUsages = new Map<string, CorridorUsage[]>()

    const departureUsages = new Map<string, CorridorUsage[]>()

    const arrivalUsages = new Map<string, CorridorUsage[]>()

    const routeOrder = new Map<Route, number>()

    this.routes.forEach((route, index) => {
      routeOrder.set(route, index)
    })

    for (const route of activeRoutes) {
      const stations = route.getStations()

      const offsets = new Array(Math.max(stations.length - 1, 0)).fill(0)

      offsetsByRoute.set(route, offsets)

      const routedSegments = OctilinearRouter.routeSegments(stations)

      for (let index = 0; index < stations.length - 1; index++) {
        const start = stations[index]
        const end = stations[index + 1]

        if (!start || !end) {
          continue
        }

        const lowerId = Math.min(start.id, end.id)

        const higherId = Math.max(start.id, end.id)

        const key = `${lowerId}:${higherId}`

        const usages = corridorUsages.get(key) ?? []

        usages.push({
          route,
          segmentIndex: index,
          forward: start.id === lowerId,
        })

        corridorUsages.set(key, usages)

        const routedSegment = routedSegments[index]
        const firstPoint = routedSegment?.[0]
        const nextPoint = routedSegment?.[1]

        if (!firstPoint || !nextPoint) {
          continue
        }

        const departureDirection = OctilinearPort.fromVector({
          x: nextPoint.x - firstPoint.x,
          y: nextPoint.y - firstPoint.y,
        })

        const departureKey = `${start.id}:${departureDirection}`

        const departures = departureUsages.get(departureKey) ?? []

        departures.push({
          route,
          segmentIndex: index,
          forward: true,
        })

        departureUsages.set(departureKey, departures)

        const beforeLastPoint = routedSegment.at(-2)
        const lastPoint = routedSegment.at(-1)

        if (!beforeLastPoint || !lastPoint) {
          continue
        }

        const arrivalDirection = OctilinearPort.fromVector({
          x: beforeLastPoint.x - lastPoint.x,
          y: beforeLastPoint.y - lastPoint.y,
        })

        const arrivalKey = `${end.id}:${arrivalDirection}`

        const arrivals = arrivalUsages.get(arrivalKey) ?? []

        arrivals.push({
          route,
          segmentIndex: index,
          forward: true,
        })

        arrivalUsages.set(arrivalKey, arrivals)
      }
    }

    this.applyLaneOffsets(corridorUsages, offsetsByRoute, routeOrder, true)

    /*
     * Different destinations can still share the first visible stretch of
     * track.  Give routes leaving the same station through the same port
     * their own lanes, so they remain visible until their paths diverge.
     */
    this.applyLaneOffsets(departureUsages, offsetsByRoute, routeOrder, false)

    this.applyLaneOffsets(arrivalUsages, offsetsByRoute, routeOrder, false)

    for (const [route, offsets] of offsetsByRoute) {
      route.setSegmentLaneOffsets(offsets)
    }
  }

  private applyLaneOffsets(
    groups: ReadonlyMap<string, CorridorUsage[]>,
    offsetsByRoute: ReadonlyMap<Route, number[]>,
    routeOrder: ReadonlyMap<Route, number>,
    reverseOffsetForOppositeDirection: boolean
  ): void {
    for (const usages of groups.values()) {
      if (usages.length < 2) {
        continue
      }

      usages.sort(
        (first, second) =>
          (routeOrder.get(first.route) ?? 0) -
          (routeOrder.get(second.route) ?? 0)
      )

      const centerIndex = (usages.length - 1) / 2

      usages.forEach((usage, index) => {
        const canonicalOffset =
          (index - centerIndex) * RouteNetwork.LANE_SPACING

        /*
         * Polyline normals reverse when routes traverse a shared corridor
         * in opposite directions. Departures already share one direction.
         */
        const routeOffset =
          reverseOffsetForOppositeDirection && !usage.forward
            ? -canonicalOffset
            : canonicalOffset

        const offsets = offsetsByRoute.get(usage.route)

        if (offsets) {
          offsets[usage.segmentIndex] = routeOffset
        }
      })
    }
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

      const terminalRoutes = activeRoutes
        .filter(
          (route) => route.stationCount >= 2 && route.isTerminalAt(station)
        )
        .sort(
          (first, second) =>
            first.getTerminalLaneOffset(station) -
            second.getTerminalLaneOffset(station)
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

      const preferredPorts = terminalRoutes.map((route) =>
        route.getPreferredTerminalPort(station)
      )

      const firstPreferredPort = preferredPorts[0]

      const allPreferSamePort =
        firstPreferredPort !== undefined &&
        preferredPorts.every((port) => port === firstPreferredPort)

      const portOffsets = allPreferSamePort
        ? this.getTerminalPortOffsets(terminalRoutes.length)
        : new Array(terminalRoutes.length).fill(0)

      terminalRoutes.forEach((route, index) => {
        const preferredPort = preferredPorts[index]

        const portOffset = portOffsets[index] ?? 0

        if (preferredPort === undefined) {
          return
        }

        const desiredPort = preferredPort + portOffset

        const laneOffset = route.getTerminalLaneOffset(station)

        const bias =
          Math.sign(laneOffset) ||
          Math.sign(portOffset) ||
          (index % 2 === 0 ? -1 : 1)

        const availablePort = this.findAvailablePort(
          desiredPort,
          usedPorts,
          bias
        )

        usedPorts.add(availablePort)

        route.setTerminalPort(station, availablePort)
      })
    }
  }

  private getTerminalPortOffsets(routeCount: number): readonly number[] {
    switch (routeCount) {
      case 1:
        return [0]

      case 2:
        return [-1, 1]

      case 3:
        return [-1, 0, 1]

      default:
        throw new Error('A station cannot have more than three routes.')
    }
  }

  private findAvailablePort(
    preferredPort: number,
    usedPorts: ReadonlySet<number>,
    bias: number
  ): number {
    const direction = bias < 0 ? -1 : 1

    for (let distance = 0; distance < 8; distance++) {
      const firstCandidate = this.normalizePort(
        preferredPort + direction * distance
      )

      if (!usedPorts.has(firstCandidate)) {
        return firstCandidate
      }

      const secondCandidate = this.normalizePort(
        preferredPort - direction * distance
      )

      if (!usedPorts.has(secondCandidate)) {
        return secondCandidate
      }
    }

    throw new Error('No terminal port is available.')
  }

  private normalizePort(port: number): number {
    return ((port % 8) + 8) % 8
  }

  /*
   * A route terminal is drawn as a short segment outside the station,
   * finished by a perpendicular cap.  Let players grab that whole exposed
   * edge rather than requiring the pointer to land on the narrow cap.
   *
   * The inset begins beyond the station outline, so a click on a station
   * still begins a new route as intended.
   */
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
      x: station.x +
        (deltaX / length) * RouteNetwork.TERMINAL_EDGE_INSET,
      y: station.y +
        (deltaY / length) * RouteNetwork.TERMINAL_EDGE_INSET,
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
