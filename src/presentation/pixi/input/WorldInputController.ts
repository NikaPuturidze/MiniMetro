import { Container, type FederatedPointerEvent } from 'pixi.js'
import type { WorldView } from '../WorldView'
import type { PixiRouteHitTester } from '../interaction/PixiRouteHitTester'
import type { RouteInteractionController } from '../interaction/RouteInteractionController'

export class WorldInputController {
  public constructor(
    private readonly stage: Container,
    private readonly world: WorldView,
    private readonly hitTester: PixiRouteHitTester,
    private readonly interaction: RouteInteractionController
  ) {
    this.stage.on('pointerdown', this.handlePointerDown)
    this.stage.on('globalpointermove', this.handlePointerMove)
    this.stage.on('pointerup', this.handlePointerUp)
    this.stage.on('pointerupoutside', this.handlePointerUpOutside)
    this.stage.on('pointercancel', this.handlePointerCancel)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener('pointerup', this.handleWindowPointerUp)
    window.addEventListener('pointercancel', this.handleWindowPointerCancel)
  }

  public dispose(): void {
    this.interaction.cancel(true)
    this.stage.off('pointerdown', this.handlePointerDown)
    this.stage.off('globalpointermove', this.handlePointerMove)
    this.stage.off('pointerup', this.handlePointerUp)
    this.stage.off('pointerupoutside', this.handlePointerUpOutside)
    this.stage.off('pointercancel', this.handlePointerCancel)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('blur', this.handleWindowBlur)
    window.removeEventListener('pointerup', this.handleWindowPointerUp)
    window.removeEventListener('pointercancel', this.handleWindowPointerCancel)
  }

  private readonly handlePointerDown = (event: FederatedPointerEvent): void => {
    const point = event.getLocalPosition(this.world)

    this.interaction.pointerDown({
      button: event.button,
      point,
      target: this.hitTester.getPointerDownTarget(event.target, point),
    })
  }

  private readonly handlePointerMove = (event: FederatedPointerEvent): void => {
    this.interaction.pointerMove({
      point: event.getLocalPosition(this.world),
      stationId: this.hitTester.getStationId(event.target),
    })
  }

  private readonly handlePointerUp = (event: FederatedPointerEvent): void => {
    this.interaction.pointerUp({
      stationId: this.hitTester.getStationId(event.target),
    })
  }

  private readonly handlePointerCancel = (): void => {
    this.interaction.cancel(true)
  }

  private readonly handlePointerUpOutside = (): void => {
    this.interaction.cancel()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.interaction.cancel()
    }
  }

  private readonly handleWindowBlur = (): void => {
    this.interaction.cancel(true)
  }

  private readonly handleWindowPointerUp = (): void => {
    this.interaction.cancel()
  }

  private readonly handleWindowPointerCancel = (): void => {
    this.interaction.cancel(true)
  }
}
