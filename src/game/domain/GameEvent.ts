import type { Point } from '@/engine/geometry/Point'
import type { RouteId, StationId } from './Ids'
import type { RouteTerminal, SegmentRoutingPreference } from './Route'

export const GameEventType = {
  StationCreated: 'station-created',
  RouteCreated: 'route-created',
  RouteConnectedToStation: 'route-connected-to-station',
  RouteClosed: 'route-closed',
  RouteReopened: 'route-reopened',
  RouteTerminalRemoved: 'route-terminal-removed',
  StationInsertedIntoRoute: 'station-inserted-into-route',
  SegmentRoutingChanged: 'segment-routing-changed',
  RouteRemoved: 'route-removed',
  RouteLayoutInvalidated: 'route-layout-invalidated',
} as const

export interface StationCreatedEvent {
  readonly type: typeof GameEventType.StationCreated
  readonly stationId: StationId
  readonly position: Point
}

export interface RouteCreatedEvent {
  readonly type: typeof GameEventType.RouteCreated
  readonly routeId: RouteId
  readonly startStationId: StationId
  readonly endStationId: StationId
}

export interface RouteConnectedToStationEvent {
  readonly type: typeof GameEventType.RouteConnectedToStation
  readonly routeId: RouteId
  readonly stationId: StationId
  readonly terminal: RouteTerminal
}

export interface RouteClosedEvent {
  readonly type: typeof GameEventType.RouteClosed
  readonly routeId: RouteId
}

export interface RouteReopenedEvent {
  readonly type: typeof GameEventType.RouteReopened
  readonly routeId: RouteId
}

export interface RouteTerminalRemovedEvent {
  readonly type: typeof GameEventType.RouteTerminalRemoved
  readonly routeId: RouteId
  readonly stationId: StationId
  readonly terminal: RouteTerminal
}

export interface StationInsertedIntoRouteEvent {
  readonly type: typeof GameEventType.StationInsertedIntoRoute
  readonly routeId: RouteId
  readonly stationId: StationId
  readonly segmentIndex: number
}

export interface SegmentRoutingChangedEvent {
  readonly type: typeof GameEventType.SegmentRoutingChanged
  readonly routeId: RouteId
  readonly segmentIndex: number
  readonly preference: SegmentRoutingPreference
}

export interface RouteRemovedEvent {
  readonly type: typeof GameEventType.RouteRemoved
  readonly routeId: RouteId
}

export interface RouteLayoutInvalidatedEvent {
  readonly type: typeof GameEventType.RouteLayoutInvalidated
  readonly changedRouteId: RouteId
}

export type GameDomainEvent =
  | StationCreatedEvent
  | RouteCreatedEvent
  | RouteConnectedToStationEvent
  | RouteClosedEvent
  | RouteReopenedEvent
  | RouteTerminalRemovedEvent
  | StationInsertedIntoRouteEvent
  | SegmentRoutingChangedEvent
  | RouteRemovedEvent
  | RouteLayoutInvalidatedEvent
