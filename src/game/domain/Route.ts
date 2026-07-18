import type { RouteColor } from '@/constants/RouteColor'
import type { RouteId, StationId } from './Ids'

export type SegmentRoutingPreference = 'diagonal-first' | 'straight-first'

interface CircularRouteClosure {
  readonly sourceTerminal: RouteTerminal
  readonly stationId: StationId
}

export class Route {
  private readonly stationIds: StationId[] = []
  private circularClosure: CircularRouteClosure | null = null

  private readonly segmentRoutingPreferences = new Map<
    string,
    SegmentRoutingPreference
  >()

  public constructor(
    public readonly id: RouteId,
    public readonly color: RouteColor
  ) {}

  public get isEmpty(): boolean {
    return this.stationIds.length === 0
  }

  public get stationCount(): number {
    return this.stationIds.length
  }

  public get isCircular(): boolean {
    return this.circularClosure !== null
  }

  public get segmentCount(): number {
    if (this.stationIds.length < 2) {
      return 0
    }

    return this.isCircular ? this.stationIds.length : this.stationIds.length - 1
  }

  public getStationIds(): readonly StationId[] {
    return this.stationIds
  }

  public getFirstStationId(): StationId | null {
    return this.stationIds[0] ?? null
  }

  public getLastStationId(): StationId | null {
    return this.stationIds.at(-1) ?? null
  }

  public getCircularClosureStationId(): StationId | null {
    return this.circularClosure?.stationId ?? null
  }

  public getCircularClosureSourceTerminal(): RouteTerminal | null {
    return this.circularClosure?.sourceTerminal ?? null
  }

  public hasStation(stationId: StationId): boolean {
    return this.stationIds.includes(stationId)
  }

  public isTerminalAt(stationId: StationId): boolean {
    if (this.isCircular) {
      return false
    }

    return (
      this.stationIds[0] === stationId || this.stationIds.at(-1) === stationId
    )
  }

  public isInternalStation(stationId: StationId): boolean {
    if (this.isCircular) {
      return this.hasStation(stationId)
    }

    const index = this.stationIds.indexOf(stationId)

    return index > 0 && index < this.stationIds.length - 1
  }

  public getSegmentStationIds(
    segmentIndex: number
  ): readonly [StationId, StationId] | null {
    const startId = this.stationIds[segmentIndex]
    const endId =
      segmentIndex === this.stationIds.length - 1 && this.isCircular
        ? this.stationIds[0]
        : this.stationIds[segmentIndex + 1]

    return startId === undefined || endId === undefined
      ? null
      : [startId, endId]
  }

  public appendStation(stationId: StationId): void {
    this.assertRouteIsOpen()
    this.assertStationCanBeAdded(stationId)
    this.stationIds.push(stationId)
  }

  public prependStation(stationId: StationId): void {
    this.assertRouteIsOpen()
    this.assertStationCanBeAdded(stationId)
    this.stationIds.unshift(stationId)
  }

  public insertStation(index: number, stationId: StationId): void {
    this.assertStationCanBeAdded(stationId)

    if (index < 0 || index > this.stationIds.length) {
      throw new RangeError('Station insertion index is outside the route.')
    }

    this.stationIds.splice(index, 0, stationId)
  }

  public close(sourceTerminal: RouteTerminal): void {
    if (this.isCircular) {
      throw new Error('Route is already circular.')
    }

    if (this.stationIds.length < 3) {
      throw new Error('A circular route requires at least three stations.')
    }

    const closureStationId =
      sourceTerminal === 'start'
        ? this.getLastStationId()
        : this.getFirstStationId()

    if (closureStationId === null) {
      throw new Error('A circular route requires a closure station.')
    }

    this.circularClosure = {
      sourceTerminal,
      stationId: closureStationId,
    }
  }

  public reopen(): void {
    if (!this.isCircular) {
      throw new Error('Route is not circular.')
    }

    this.circularClosure = null
  }

  public removeTerminal(terminal: RouteTerminal): StationId | null {
    this.assertRouteIsOpen()

    if (terminal === 'start') {
      return this.stationIds.shift() ?? null
    }

    return this.stationIds.pop() ?? null
  }

  public clear(): void {
    this.stationIds.length = 0
    this.circularClosure = null
    this.segmentRoutingPreferences.clear()
  }

  public setSegmentRoutingPreference(
    segmentIndex: number,
    preference: SegmentRoutingPreference
  ): void {
    const segment = this.getSegmentStationIds(segmentIndex)

    if (!segment) {
      throw new RangeError('Route segment index is outside the route.')
    }

    this.segmentRoutingPreferences.set(
      this.getSegmentKey(segment[0], segment[1]),
      preference
    )
  }

  public setRoutingPreferenceBetween(
    startId: StationId,
    endId: StationId,
    preference: SegmentRoutingPreference
  ): void {
    this.segmentRoutingPreferences.set(
      this.getSegmentKey(startId, endId),
      preference
    )
  }

  public getSegmentRoutingPreference(
    segmentIndex: number
  ): SegmentRoutingPreference | undefined {
    const segment = this.getSegmentStationIds(segmentIndex)

    if (!segment) {
      return undefined
    }

    return this.segmentRoutingPreferences.get(
      this.getSegmentKey(segment[0], segment[1])
    )
  }

  public getRoutingPreferenceBetween(
    startId: StationId,
    endId: StationId
  ): SegmentRoutingPreference | undefined {
    return this.segmentRoutingPreferences.get(
      this.getSegmentKey(startId, endId)
    )
  }

  private assertStationCanBeAdded(stationId: StationId): void {
    if (this.hasStation(stationId)) {
      throw new Error('Station is already part of the route.')
    }
  }

  private assertRouteIsOpen(): void {
    if (this.isCircular) {
      throw new Error('A circular route has no terminals.')
    }
  }

  private getSegmentKey(startId: StationId, endId: StationId): string {
    return `${startId}:${endId}`
  }
}

export type RouteTerminal = 'start' | 'end'
