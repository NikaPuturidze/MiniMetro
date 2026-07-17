import type { StationType } from '@/constants/StationType'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type {
  RouteTerminal,
  SegmentRoutingPreference,
} from '@/game/domain/Route'
import type { GameCommandFailure } from '@/game/domain/RouteRules'

export type CommandResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly reason: GameCommandFailure }

export interface CreateStationInput {
  readonly x: number
  readonly y: number
  readonly stationType: StationType
}

export interface StartRouteInput {
  readonly startStationId: StationId
  readonly endStationId: StationId
}

export interface ExtendRouteInput {
  readonly routeId: RouteId
  readonly stationId: StationId
  readonly terminal: RouteTerminal
}

export interface InsertStationInput {
  readonly routeId: RouteId
  readonly stationId: StationId
  readonly segmentIndex: number
}

export interface RemoveRouteTerminalInput {
  readonly routeId: RouteId
  readonly terminal: RouteTerminal
}

export interface SetSegmentRoutingInput {
  readonly routeId: RouteId
  readonly segmentIndex: number
  readonly preference: SegmentRoutingPreference
}

export interface GameCommands {
  createStation(input: CreateStationInput): CommandResult<StationId>
  startRoute(input: StartRouteInput): CommandResult<RouteId>
  extendRoute(input: ExtendRouteInput): CommandResult<void>
  insertStation(input: InsertStationInput): CommandResult<void>
  removeRouteTerminal(input: RemoveRouteTerminalInput): CommandResult<void>
  setSegmentRouting(input: SetSegmentRoutingInput): CommandResult<void>
  removeRoute(routeId: RouteId): CommandResult<void>
}
