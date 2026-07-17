import { Application } from 'pixi.js'
import { Game } from './core/Game'

async function bootstrap(): Promise<void> {
  const app = new Application()

  await app.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 10),
    backgroundColor: 0xeeeeee,
  })

  document.body.appendChild(app.canvas)

  const game = new Game(app)
  game.start()
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to start the game:', error)
})
