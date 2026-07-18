import type { GameStateReader } from './GameState'
import type { RouteId, StationId } from './Ids'
import type { SegmentRoutingPreference } from './Route'

export interface RouteGeometryCandidate {
  readonly routeId: RouteId
  readonly stationIds: readonly StationId[]
  readonly isCircular: boolean
  readonly preferences: readonly (SegmentRoutingPreference | undefined)[]
  readonly flexibleSegmentIndices: readonly number[]
}

export interface RouteRoutingChoice {
  readonly startStationId: StationId
  readonly endStationId: StationId
  readonly preference: SegmentRoutingPreference
}

export interface RouteGeometryPolicy {
  plan(
    candidate: RouteGeometryCandidate,
    state: GameStateReader
  ): readonly RouteRoutingChoice[] | null
}
