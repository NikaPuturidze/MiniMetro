import type { Application } from 'pixi.js'
import type { GameEngine } from '@/engine/GameEngine'
import type { WorldView } from '@/presentation/pixi/WorldView'

export interface Disposable {
  dispose(): void
}

export class Game {
  private isRunning = false

  public constructor(
    private readonly app: Application,
    private readonly world: WorldView,
    private readonly engine: GameEngine,
    private readonly runtimeResources: readonly Disposable[]
  ) {}

  public start(): void {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.app.stage.addChild(this.world)
    this.engine.start()
  }

  public stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    this.engine.stop()
    this.world.removeFromParent()
  }

  public destroy(): void {
    this.stop()

    for (const resource of [...this.runtimeResources].reverse()) {
      resource.dispose()
    }

    this.world.destroy({ children: true })
  }
}
