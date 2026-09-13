import {
  UniversalCamera,
  Scene,
  Vector3,
  Nullable, // Added for Observer typing
  Observer, // Added for Observer class
  // Mesh, TransformNode, Engine, ArcRotateCamera, Quaternion are also in the core import
} from "@babylonjs/core";
import { Car } from "../entities/Car"; // Import the Car entity

/**
 * CamFollow manages the dynamic third-person camera that follows the car.
 * It applies smoothing, speed-based distance adjustments, and acceleration lag effects.
 *
 * It now manages its own update loop by attaching to the scene's onBeforeRenderObservable,
 * using the enableUpdate() and disableUpdate() methods.
 */
export class CamFollow {
  public camera: UniversalCamera;
  private car: Car | null = null;
  private scene: Scene;

  // Stores the reference to the active observer attached to the scene's render loop.
  private updateObserver: Nullable<Observer<Scene>> = null;

  // --- Camera Parameters ---
  // Base position offset from the car (x, y (height), z (distance behind))
  private readonly baseOffset = new Vector3(0, 4, 12);
  // Max additional distance the camera pulls back at top speed
  private readonly maxSpeedOffset = 3;

  // --- Fixed Smoothing Constants ---
  // LOW VALUE = SMOOTHER (more lag), HIGH VALUE = RESPONSIVE (less lag)
  private readonly positionLerp = 0.05; // Fixed smoothing factor (alpha)
  private readonly lookAtLerp = 0.1; // For smooth camera rotation/target (this remains fixed)

  // Compensation to visually move the camera closer to the car, counteracting the distance
  // added by the fixed, small LERP factor (lag).
  private readonly visualLagCompensation = 5.0;

  // Approximation of the car's top speed (m/s) for normalization (approx 350 kph)
  private readonly maxVelocity = 197.22;

  // State tracking
  private targetLookAt: Vector3 = new Vector3(0, 0, 0);

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    // Create the UniversalCamera and attach it to the canvas
    this.camera = new UniversalCamera(
      "CamFollow",
      new Vector3(0, 10, -10),
      scene
    );

    this.camera.setTarget(Vector3.Zero());
    this.camera.speed = 0; // Camera movement is controlled entirely by the update loop
    this.camera.attachControl(canvas, true);

    // Initial field of view (FOV) setting
    this.camera.fov = 0.8;
  }

  /**
   * Sets the car entity for the camera to follow.
   * @param car The Car instance.
   */
  public setCar(car: Car): void {
    this.car = car;
    // Automatically enable update when a car is set
    this.enableUpdate();
  }

  /**
   * Attaches the camera update logic to the scene's before render observable,
   * allowing it to update every frame.
   */
  public enableUpdate(): void {
    if (this.updateObserver === null) {
      // Use an arrow function to preserve 'this' context when calling updateLogic
      this.updateObserver = this.scene.onBeforeRenderObservable.add(
        this.updateLogic
      );
      console.log("CamFollow: Update logic enabled.");
    }
  }

  /**
   * Detaches the camera update logic from the scene's before render observable,
   * pausing camera movement.
   */
  public disableUpdate(): void {
    if (this.updateObserver !== null) {
      this.scene.onBeforeRenderObservable.remove(this.updateObserver);
      this.updateObserver = null;
      console.log("CamFollow: Update logic disabled.");
    }
  }

  /**
   * Main update logic function, executed on every frame before rendering.
   * It uses an arrow function to calculate dt and apply effects.
   */
  private updateLogic = (): void => {
    if (!this.car || !this.car.root) return;

    const carRoot = this.car.root;
    const currentVelocity = this.car.Velocity; // m/s
    const absVelocity = Math.abs(currentVelocity);

    // 1. Fixed Smoothing Alpha (Alpha is now a constant)
    const alpha = this.positionLerp;

    // 2. Dynamic Z-Offset Calculation (Distance behind the car)
    // Normalize speed (0 to 1)
    const speedRatio = Math.min(absVelocity / this.maxVelocity, 1.0);

    // Use exposed Acceleration property (m/s^2)
    const acceleration = this.car.Acceleration;

    // Base distance offset: camera pulls back as speed increases.
    let zDistance = this.baseOffset.z + speedRatio * this.maxSpeedOffset;

    // Acceleration Lag Effect:
    // Clamp acceleration to a reasonable range for visual effect
    const clampedAcceleration = Math.max(-40, Math.min(acceleration, 40));

    // Calculate how much to shift the camera along the Z axis based on acceleration
    const lagOffset = clampedAcceleration * 0.07;
    const dynamicLagFactor = 1.0 - speedRatio * 0.3;

    // Subtract lag from zDistance to pull the camera forward when accelerating (lagOffset > 0)
    zDistance += lagOffset * dynamicLagFactor;

    // Clamp the Z distance to prevent it from going too far or too close.
    zDistance = Math.max(7, Math.min(zDistance, 15));

    // --- LAG COMPENSATION: Move the target closer to the car ---
    zDistance -= this.visualLagCompensation;
    // Re-clamp to ensure the compensated distance doesn't become too small (minimum 2m)
    zDistance = Math.max(2, zDistance);

    // 3. Target Position (in World Space)

    // Get the car's current world position
    const carWorldPosition = carRoot.position;

    // Get the car's forward vector in world space.
    const carForwardVector = carRoot.getDirection(Vector3.Forward());

    // Calculate the final target camera position
    const targetPosition = carWorldPosition
      // 1. Add vertical offset (Y)
      .add(new Vector3(0, this.baseOffset.y, 0))
      // 2. Add the position BEHIND the car (zDistance is positive, so we use the forward vector)
      .add(carForwardVector.scale(zDistance));

    // 4. Smooth Camera Position Update (Lerp)
    // Use the fixed 'alpha' value
    this.camera.position = Vector3.Lerp(
      this.camera.position,
      targetPosition,
      alpha // Using fixed LERP factor (0.05)
    );

    // 5. Look Target (Smoothing for turning)

    // The look-at point is slightly ahead of the car's position
    const lookAheadDistance = 5 + speedRatio * 5; // Look further ahead at high speeds
    const lookAheadVector = carForwardVector.scale(lookAheadDistance); // Scale the world forward vector

    // The point to look at: Car Position - Look Ahead Vector + Height Offset
    const targetLookPoint = carWorldPosition
      .subtract(lookAheadVector) // Go forward from the car (subtract since carForwardVector points backward)
      .add(new Vector3(0, 1.5, 0)); // Look slightly above the car's center

    // Smooth the look-at point
    this.targetLookAt = Vector3.Lerp(
      this.targetLookAt,
      targetLookPoint,
      this.lookAtLerp
    );

    this.camera.setTarget(this.targetLookAt);

    // 6. FOV Effect (Zooming out at high speed for visual drama)
    const targetFOV = 0.8 + speedRatio * 0.3; // Zoom out by 0.3 at max speed
    // Smoothly adjust FOV
    this.camera.fov = this.camera.fov + (targetFOV - this.camera.fov) * 0.1;
  };
}
