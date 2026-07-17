import { Graphics } from 'pixi.js'
import type { Station } from '@/entities/Station'
import { OctilinearRouter, type RoutePoint } from '@/logic/OctilinearRouter'
import { PolylineOffset } from '@/logic/PolylineOffset'
import { OctilinearPort } from '@/logic/OctilinearPort'

export class Route extends Graphics {
  public static readonly LINE_WIDTH = 8

  private hiddenTerminalStation: Station | null = null
  private singleStationTerminalPort = 6

  private static readonly TERMINAL_EXTENSION = 30
  private static readonly TERMINAL_CAP_LENGTH = 20
  private static readonly CORNER_RADIUS = 10

  private readonly stations: Station[] = []

  private segmentLaneOffsets: number[] = []

  private startTerminalPort: number | null = null
  private endTerminalPort: number | null = null

  private startTerminalPosition: RoutePoint | null = null
  private endTerminalPosition: RoutePoint | null = null

  public constructor(public readonly color: number) {
    super()
  }

  public get isEmpty(): boolean {
    return this.stations.length === 0
  }

  public get stationCount(): number {
    return this.stations.length
  }

  public getStations(): readonly Station[] {
    return this.stations
  }

  public hasStation(station: Station): boolean {
    return this.stations.includes(station)
  }

  public removeStation(station: Station): void {
    const index = this.stations.indexOf(station)

    if (index !== -1) {
      this.stations.splice(index, 1)
    }
  }

  public clearStations(): void {
    this.stations.length = 0
  }

  public setSegmentLaneOffsets(offsets: readonly number[]): void {
    this.segmentLaneOffsets = [...offsets]
  }

  public getSegmentLaneOffset(segmentIndex: number): number {
    return this.segmentLaneOffsets[segmentIndex] ?? 0
  }

  public getTerminalLaneOffset(station: Station): number {
    if (this.stations[0] === station) {
      return this.segmentLaneOffsets[0] ?? 0
    }

    if (this.stations.at(-1) === station) {
      return this.segmentLaneOffsets.at(-1) ?? 0
    }

    return 0
  }

  public setTerminalPort(station: Station, port: number): void {
    if (this.stations[0] === station) {
      this.startTerminalPort = port
    }

    if (this.stations.at(-1) === station) {
      this.endTerminalPort = port
    }
  }

  public resetTerminalPorts(): void {
    this.startTerminalPort = null
    this.endTerminalPort = null
  }

  public isTerminalAt(station: Station): boolean {
    return this.stations[0] === station || this.stations.at(-1) === station
  }

  public hideTerminalAt(station: Station): void {
    if (this.isTerminalAt(station)) {
      this.hiddenTerminalStation = station
    }
  }

  public showAllTerminals(): void {
    this.hiddenTerminalStation = null
  }

  public removeTerminalStation(station: Station): boolean {
    if (this.stations.length === 0) {
      return false
    }

    if (this.stations.length === 1 && this.stations[0] === station) {
      this.stations.pop()
      return true
    }

    if (this.stations[0] === station) {
      const remainingPort = this.endTerminalPort ?? 6

      this.stations.shift()

      if (this.stations.length === 1) {
        this.singleStationTerminalPort = remainingPort
      }

      return true
    }

    if (this.stations.at(-1) === station) {
      const remainingPort = this.startTerminalPort ?? 6

      this.stations.pop()

      if (this.stations.length === 1) {
        this.singleStationTerminalPort = remainingPort
      }

      return true
    }

    return false
  }

  public isInternalStation(station: Station): boolean {
    const index = this.stations.indexOf(station)

    return index > 0 && index < this.stations.length - 1
  }

  public getIncidentPorts(station: Station): readonly number[] {
    const stationIndex = this.stations.indexOf(station)

    if (stationIndex === -1) {
      return []
    }

    const segments = OctilinearRouter.routeSegments(this.stations)

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

    if (stationIndex < this.stations.length - 1) {
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

  public getPreferredTerminalPort(station: Station): number {
    if (!this.isTerminalAt(station)) {
      throw new Error('Station is not a route terminal.')
    }

    const incidentPort = this.getIncidentPorts(station)[0]

    if (incidentPort === undefined) {
      throw new Error('Route requires two stations.')
    }

    return (incidentPort + 4) % 8
  }

  public getStartTerminalPosition(): RoutePoint | null {
    return this.startTerminalPosition
  }

  public getEndTerminalPosition(): RoutePoint | null {
    return this.endTerminalPosition
  }

  public redraw(): void {
    this.clear()

    this.startTerminalPosition = null
    this.endTerminalPosition = null

    if (this.stations.length === 1) {
      this.drawSingleStationTerminal()
      return
    }

    const routedSegments = OctilinearRouter.routeSegments(this.stations)

    if (routedSegments.length === 0) {
      return
    }

    routedSegments.forEach((centerPoints, segmentIndex) => {
      const points = PolylineOffset.calculate(
        centerPoints,
        this.getSegmentLaneOffset(segmentIndex)
      )

      const roundable = points.map(
        (_, pointIndex) => pointIndex > 0 && pointIndex < points.length - 1
      )

      this.drawRoundedPath(points, roundable)
    })

    const firstStation = this.stations[0]
    const lastStation = this.stations.at(-1)

    if (!firstStation || !lastStation) {
      return
    }

    const startPort =
      this.startTerminalPort ?? this.getPreferredTerminalPort(firstStation)

    const endPort =
      this.endTerminalPort ?? this.getPreferredTerminalPort(lastStation)

    const startDirection = OctilinearPort.getDirection(startPort)

    const endDirection = OctilinearPort.getDirection(endPort)

    /* Terminal gaps are always radial from the station centre. */
    const startOrigin: RoutePoint = {
      x: firstStation.x,
      y: firstStation.y,
    }

    const endOrigin: RoutePoint = {
      x: lastStation.x,
      y: lastStation.y,
    }

    const startTerminal: RoutePoint = {
      x: startOrigin.x + startDirection.x * Route.TERMINAL_EXTENSION,
      y: startOrigin.y + startDirection.y * Route.TERMINAL_EXTENSION,
    }

    const endTerminal: RoutePoint = {
      x: endOrigin.x + endDirection.x * Route.TERMINAL_EXTENSION,
      y: endOrigin.y + endDirection.y * Route.TERMINAL_EXTENSION,
    }

    this.startTerminalPosition = startTerminal
    this.endTerminalPosition = endTerminal

    if (this.hiddenTerminalStation !== firstStation) {
      this.startTerminalPosition = startTerminal

      this.moveTo(startOrigin.x, startOrigin.y)

      this.lineTo(startTerminal.x, startTerminal.y)

      this.drawTerminalCap(startTerminal, startDirection)
    }

    if (this.hiddenTerminalStation !== lastStation) {
      this.endTerminalPosition = endTerminal

      this.moveTo(endOrigin.x, endOrigin.y)

      this.lineTo(endTerminal.x, endTerminal.y)

      this.drawTerminalCap(endTerminal, endDirection)
    }

    this.stroke({
      color: this.color,
      width: Route.LINE_WIDTH,
      cap: 'butt',
      join: 'round',
    })
  }

  public getFirstStation(): Station | null {
    return this.stations[0] ?? null
  }

  public getLastStation(): Station | null {
    return this.stations.at(-1) ?? null
  }

  public appendStation(station: Station): void {
    if (!this.hasStation(station)) {
      this.stations.push(station)
    }
  }

  public prependStation(station: Station): void {
    if (!this.hasStation(station)) {
      this.stations.unshift(station)
    }
  }

  private drawRoundedPath(
    points: readonly RoutePoint[],
    roundable: readonly boolean[]
  ): void {
    const first = points[0]

    if (!first) {
      return
    }

    this.moveTo(first.x, first.y)

    for (let index = 1; index < points.length - 1; index++) {
      const previous = points[index - 1]
      const current = points[index]
      const next = points[index + 1]

      if (!previous || !current || !next) {
        continue
      }

      if (!roundable[index]) {
        this.lineTo(current.x, current.y)
        continue
      }

      const incomingLength = Math.hypot(
        current.x - previous.x,
        current.y - previous.y
      )

      const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y)

      const radius = Math.min(
        Route.CORNER_RADIUS,
        incomingLength / 2,
        outgoingLength / 2
      )

      const entryPoint = this.moveTowards(current, previous, radius)

      const exitPoint = this.moveTowards(current, next, radius)

      this.lineTo(entryPoint.x, entryPoint.y)

      this.quadraticCurveTo(current.x, current.y, exitPoint.x, exitPoint.y)
    }

    const last = points.at(-1)

    if (last) {
      this.lineTo(last.x, last.y)
    }
  }

  private drawSingleStationTerminal(): void {
    const station = this.stations[0]

    if (!station || this.hiddenTerminalStation === station) {
      return
    }

    const direction = OctilinearPort.getDirection(
      this.singleStationTerminalPort
    )

    const origin: RoutePoint = {
      x: station.x,
      y: station.y,
    }

    const terminal: RoutePoint = {
      x: origin.x + direction.x * Route.TERMINAL_EXTENSION,
      y: origin.y + direction.y * Route.TERMINAL_EXTENSION,
    }

    this.startTerminalPosition = terminal

    this.moveTo(origin.x, origin.y)
    this.lineTo(terminal.x, terminal.y)

    this.drawTerminalCap(terminal, direction)

    this.stroke({
      color: this.color,
      width: Route.LINE_WIDTH,
      cap: 'butt',
      join: 'round',
    })
  }

  private moveTowards(
    start: RoutePoint,
    target: RoutePoint,
    distance: number
  ): RoutePoint {
    const deltaX = target.x - start.x
    const deltaY = target.y - start.y
    const length = Math.hypot(deltaX, deltaY)

    if (length === 0) {
      return start
    }

    return {
      x: start.x + (deltaX / length) * distance,
      y: start.y + (deltaY / length) * distance,
    }
  }

  private drawTerminalCap(terminal: RoutePoint, direction: RoutePoint): void {
    const halfLength = Route.TERMINAL_CAP_LENGTH / 2

    const normal = {
      x: -direction.y,
      y: direction.x,
    }

    this.moveTo(
      terminal.x - normal.x * halfLength,
      terminal.y - normal.y * halfLength
    )

    this.lineTo(
      terminal.x + normal.x * halfLength,
      terminal.y + normal.y * halfLength
    )
  }

}
