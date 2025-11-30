import Phaser from 'phaser'

type BoatSnapshot = {
  x: number
  y: number
  headingDeg: number
  speedPixelsPerSecond: number
  color: number
}

export class BoatSprite extends Phaser.Physics.Arcade.Sprite {
  private targetPosition = new Phaser.Math.Vector2()
  private targetHeadingDeg = 0
  private targetSpeed = 0

  constructor(scene: Phaser.Scene, x: number, y: number, color: number) {
    super(scene, x, y, '__boat_placeholder')
    scene.add.existing(this)
    scene.physics.add.existing(this)
    this.setTint(color || 0xffffff)
    this.setOrigin(0.5, 0.5)
    this.setDepth(5)
    this.setAlpha(0.95)
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setCircle(14, 6, 6)
    body.setBounce(0, 0)
    body.setDamping(true)
    body.setDrag(220, 220)
    body.setMaxSpeed(1200)
  }

  setServerSnapshot(snapshot: BoatSnapshot) {
    this.targetPosition.set(snapshot.x, snapshot.y)
    this.targetHeadingDeg = snapshot.headingDeg
    this.targetSpeed = snapshot.speedPixelsPerSecond
    this.setTint(snapshot.color || 0xffffff)
  }

  override preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta)
    const lerp = 1 - Math.exp(-delta * 0.012)
    this.x = Phaser.Math.Linear(this.x, this.targetPosition.x, lerp)
    this.y = Phaser.Math.Linear(this.y, this.targetPosition.y, lerp)
    const targetRotation = Phaser.Math.DegToRad(this.targetHeadingDeg)
    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, targetRotation, lerp * 4)

    const body = this.body as Phaser.Physics.Arcade.Body | undefined
    if (body) {
      const headingRad = Phaser.Math.DegToRad(this.targetHeadingDeg)
      body.setVelocity(
        Math.sin(headingRad) * this.targetSpeed,
        -Math.cos(headingRad) * this.targetSpeed,
      )
    }
  }
}

