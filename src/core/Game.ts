import type { Application, Ticker } from 'pixi.js'
import { World } from './World'
import { StationType } from '@/constants/StationType'

export class Game {
  private readonly world: World

  private isRunning = false

  public constructor(private readonly app: Application) {
    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = this.app.screen

    this.world = new World(this.app.stage)

    /*
     * Stations exist, but all routes are initially empty
     * and available in RouteNetwork.
     */
    this.world.createStation(100, 100, StationType.Circle)

    this.world.createStation(250, 280, StationType.Triangle)

    this.world.createStation(550, 280, StationType.Rectangle)

    this.world.createStation(750, 300, StationType.Rectangle)
  }

  public start(): void {
    if (this.isRunning) {
      return
    }

    this.isRunning = true

    this.app.stage.addChild(this.world)
    this.app.ticker.add(this.update)
  }

  public stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    this.app.ticker.remove(this.update)
    this.world.removeFromParent()
  }

  public destroy(): void {
    this.stop()
    this.world.dispose()
    this.world.destroy({
      children: true,
    })
  }

  private readonly update = (ticker: Ticker): void => {
    const deltaSeconds = ticker.deltaMS / 1000

    this.world.update(deltaSeconds)
  }
}
