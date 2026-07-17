import type { EventSource } from '@/engine/events/EventDispatcher'
import type { GameDomainEvent } from '@/game/domain/GameEvent'
import type { GameStateReader } from '@/game/domain/GameState'
import type {
  CommandResult,
  CreateStationInput,
  ExtendRouteInput,
  GameCommands,
  InsertStationInput,
  RemoveRouteTerminalInput,
  SetSegmentRoutingInput,
  StartRouteInput,
} from './GameCommands'
import type { RouteId, StationId } from '@/game/domain/Ids'

export class GameSession implements GameCommands {
  public constructor(
    public readonly state: GameStateReader,
    public readonly events: EventSource<GameDomainEvent>,
    private readonly commands: GameCommands
  ) {}

  public createStation(input: CreateStationInput): CommandResult<StationId> {
    return this.commands.createStation(input)
  }

  public startRoute(input: StartRouteInput): CommandResult<RouteId> {
    return this.commands.startRoute(input)
  }

  public extendRoute(input: ExtendRouteInput): CommandResult<void> {
    return this.commands.extendRoute(input)
  }

  public insertStation(input: InsertStationInput): CommandResult<void> {
    return this.commands.insertStation(input)
  }

  public removeRouteTerminal(
    input: RemoveRouteTerminalInput
  ): CommandResult<void> {
    return this.commands.removeRouteTerminal(input)
  }

  public setSegmentRouting(input: SetSegmentRoutingInput): CommandResult<void> {
    return this.commands.setSegmentRouting(input)
  }

  public removeRoute(routeId: RouteId): CommandResult<void> {
    return this.commands.removeRoute(routeId)
  }
}
