import type { RouteColor } from '@/constants/RouteColor'
import type { RouteId, StationId } from './Ids'

export type SegmentRoutingPreference = 'diagonal-first' | 'straight-first'

export class Route {
  private readonly stationIds: StationId[] = []

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

  public getStationIds(): readonly StationId[] {
    return this.stationIds
  }

  public getFirstStationId(): StationId | null {
    return this.stationIds[0] ?? null
  }

  public getLastStationId(): StationId | null {
    return this.stationIds.at(-1) ?? null
  }

  public hasStation(stationId: StationId): boolean {
    return this.stationIds.includes(stationId)
  }

  public isTerminalAt(stationId: StationId): boolean {
    return (
      this.stationIds[0] === stationId || this.stationIds.at(-1) === stationId
    )
  }

  public isInternalStation(stationId: StationId): boolean {
    const index = this.stationIds.indexOf(stationId)

    return index > 0 && index < this.stationIds.length - 1
  }

  public appendStation(stationId: StationId): void {
    this.assertStationCanBeAdded(stationId)
    this.stationIds.push(stationId)
  }

  public prependStation(stationId: StationId): void {
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

  public removeTerminal(terminal: RouteTerminal): StationId | null {
    if (terminal === 'start') {
      return this.stationIds.shift() ?? null
    }

    return this.stationIds.pop() ?? null
  }

  public clear(): void {
    this.stationIds.length = 0
    this.segmentRoutingPreferences.clear()
  }

  public setSegmentRoutingPreference(
    segmentIndex: number,
    preference: SegmentRoutingPreference
  ): void {
    const startId = this.stationIds[segmentIndex]
    const endId = this.stationIds[segmentIndex + 1]

    if (startId === undefined || endId === undefined) {
      throw new RangeError('Route segment index is outside the route.')
    }

    this.segmentRoutingPreferences.set(
      this.getSegmentKey(startId, endId),
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
    const startId = this.stationIds[segmentIndex]
    const endId = this.stationIds[segmentIndex + 1]

    if (startId === undefined || endId === undefined) {
      return undefined
    }

    return this.segmentRoutingPreferences.get(
      this.getSegmentKey(startId, endId)
    )
  }

  private assertStationCanBeAdded(stationId: StationId): void {
    if (this.hasStation(stationId)) {
      throw new Error('Station is already part of the route.')
    }
  }

  private getSegmentKey(startId: StationId, endId: StationId): string {
    return `${startId}:${endId}`
  }
}

export type RouteTerminal = 'start' | 'end'
