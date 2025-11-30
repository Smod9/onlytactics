import Phaser from 'phaser'
import { GameScene } from './GameScene'

const IS_DEV = import.meta.env.DEV ?? false
const PHASER_KEY = '__onlytactics_phaser__'

type PhaserSingleton = {
  game: Phaser.Game
  scene: GameScene | null
  readyCallbacks: Set<(scene: GameScene) => void>
}

const getSingleton = () => ((window as any)[PHASER_KEY] as PhaserSingleton | undefined) ?? null

const setSingleton = (value: PhaserSingleton | null) => {
  if (value) {
    ;(window as any)[PHASER_KEY] = value
  } else {
    delete (window as any)[PHASER_KEY]
  }
}

const ensureGame = (parent: HTMLDivElement): PhaserSingleton => {
  const existing = getSingleton()
  if (existing) {
    if (IS_DEV) console.debug('[phaser-game] reusing existing game')
    if (existing.game.canvas.parentElement !== parent) {
      parent.appendChild(existing.game.canvas)
    }
    return existing
  }

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth || 1280,
      height: parent.clientHeight || 720,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: import.meta.env.DEV,
      },
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
  }

  const game = new Phaser.Game(config)
  if (IS_DEV) {
    console.debug('[phaser-game] created', { booted: game.isBooted })
  }

  const singleton: PhaserSingleton = {
    game,
    scene: null,
    readyCallbacks: new Set(),
  }
  setSingleton(singleton)

  const emitReady = (scene: GameScene) => {
    singleton.scene = scene
    if (IS_DEV) {
      console.debug('[phaser-game] scene ready', {
        active: scene.sys.isActive(),
        status: scene.scene?.settings?.status,
      })
    }
    singleton.readyCallbacks.forEach((listener) => listener(scene))
    singleton.readyCallbacks.clear()
  }

  const resolveScene = () => {
    let scene: GameScene | undefined
    try {
      scene = game.scene.getScene('RaceScene') as GameScene | undefined
    } catch {
      scene = undefined
    }

    if (!scene) {
      if (IS_DEV) {
        console.debug('[phaser-game] RaceScene not found, registering')
      }
      const instance = new GameScene()
      const originalCreate = instance.create?.bind(instance)
      instance.create = function () {
        const result = originalCreate?.()
        emitReady(instance)
        return result
      }
      game.scene.add('RaceScene', instance, false)
      scene = instance
      game.scene.start('RaceScene')
      return
    }

    if (scene.sys.isActive()) {
      emitReady(scene)
    }
  }

  if (game.isBooted) {
    resolveScene()
  } else {
    game.events.once(Phaser.Core.Events.BOOT, resolveScene)
  }

  return singleton
}

export type PhaserGameHandle = {
  game: Phaser.Game
  scene: GameScene | null
  onReady: (callback: (scene: GameScene) => void) => () => void
  destroy: () => void
}

export const createPhaserGame = (parent: HTMLDivElement): PhaserGameHandle => {
  const singleton = ensureGame(parent)

  return {
    game: singleton.game,
    scene: singleton.scene,
    onReady: (callback) => {
      if (singleton.scene) {
        callback(singleton.scene)
        return () => {}
      }
      singleton.readyCallbacks.add(callback)
      return () => {
        singleton.readyCallbacks.delete(callback)
      }
    },
    destroy: () => {
      if (IS_DEV) {
        // In dev, StrictMode remounts, so just detach the canvas so a duplicate isn’t created.
        if (singleton.game.canvas.parentElement === parent) {
          parent.removeChild(singleton.game.canvas)
        }
        return
      }
      singleton.game.destroy(true)
      setSingleton(null)
    },
  }
}

