import type { Application } from 'pixi.js'
import { RouteColor } from '@/constants/RouteColor'
import { GameEngine } from '@/engine/GameEngine'
import { InMemoryEventDispatcher } from '@/engine/events/EventDispatcher'
import { GameSession } from '@/game/application/GameSession'
import { RouteEditingService } from '@/game/application/RouteEditingService'
import type { GameDomainEvent } from '@/game/domain/GameEvent'
import { GameState } from '@/game/domain/GameState'
import { Route } from '@/game/domain/Route'
import { RouteRules } from '@/game/domain/RouteRules'
import { RouteLayoutCalculator } from '@/game/layout/RouteLayoutCalculator'
import { createDevelopmentScenario } from '@/game/setup/createDevelopmentScenario'
import { PixiGameClock } from '@/presentation/pixi/PixiGameClock'
import { WorldView } from '@/presentation/pixi/WorldView'
import { RouteViewEventHandler } from '@/presentation/pixi/event-handlers/RouteViewEventHandler'
import { StationViewEventHandler } from '@/presentation/pixi/event-handlers/StationViewEventHandler'
import { WorldInputController } from '@/presentation/pixi/input/WorldInputController'
import { PixiRouteHitTester } from '@/presentation/pixi/interaction/PixiRouteHitTester'
import { RouteInteractionController } from '@/presentation/pixi/interaction/RouteInteractionController'
import { RoutePreviewController } from '@/presentation/pixi/preview/RoutePreviewController'
import { RouteViewRegistry } from '@/presentation/pixi/registries/RouteViewRegistry'
import { StationViewRegistry } from '@/presentation/pixi/registries/StationViewRegistry'
import { RoutePreviewView } from '@/presentation/pixi/views/RoutePreviewView'
import { Game } from './Game'

export class GameCompositionRoot {
  public static create(app: Application): Game {
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen

    const state = new GameState()
    const routeColors = [
      RouteColor.Red,
      RouteColor.Blue,
      RouteColor.Green,
    ] as const

    routeColors.forEach((color, index) => {
      state.addRoute(new Route(index + 1, color))
    })

    const events = new InMemoryEventDispatcher<GameDomainEvent>()
    const routeEditing = new RouteEditingService(
      state,
      new RouteRules(),
      events
    )
    const session = new GameSession(state, events, routeEditing)
    const world = new WorldView()
    const stationViews = new StationViewRegistry(world, state)
    const routeViews = new RouteViewRegistry(world, state)
    const previewView = new RoutePreviewView()

    world.addPreviewView(previewView)

    const stationViewEvents = new StationViewEventHandler(events, stationViews)
    const routeViewEvents = new RouteViewEventHandler(
      events,
      state,
      new RouteLayoutCalculator(),
      routeViews
    )
    const preview = new RoutePreviewController(state, previewView)
    const hitTester = new PixiRouteHitTester(routeViews)
    const interaction = new RouteInteractionController(
      state,
      session,
      routeViews,
      preview
    )
    const input = new WorldInputController(
      app.stage,
      world,
      hitTester,
      interaction
    )
    const engine = new GameEngine(new PixiGameClock(app.ticker))

    createDevelopmentScenario(session)
    routeViewEvents.renderInitialState()

    return new Game(app, world, engine, [
      input,
      routeViewEvents,
      stationViewEvents,
    ])
  }
}
