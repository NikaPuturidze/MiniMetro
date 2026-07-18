import type { Point } from '@/engine/geometry/Point'
import type { RouteId, StationId } from '@/game/domain/Ids'
import type { SegmentRoutingPreference } from '@/game/domain/Route'

export type RouteInteractionState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'station-press'
      readonly stationId: StationId
      readonly pointerDownPoint: Point
      readonly routeColor: number
    }
  | {
      readonly kind: 'route-drag'
      readonly startStationId: StationId
      readonly routeId: RouteId | null
      readonly lastRetractedStationId: StationId | null
      readonly lastJoinedStationId: StationId | null
    }
  | {
      readonly kind: 'segment-drag'
      readonly routeId: RouteId
      readonly segmentIndex: number
      readonly routingPreference: SegmentRoutingPreference | null
    }

export const idleInteraction: RouteInteractionState = { kind: 'idle' }
