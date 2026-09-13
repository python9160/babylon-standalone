import { FreeCamera, Scene, Vector3, Mesh, Scalar } from "@babylonjs/core";

export class CameraFollow {
  private camera: FreeCamera;
  private playerMesh!: Mesh;

  private targetPosition: Vector3;
  private currentAngleY: number;

  private readonly followHeight = 3;
  private readonly followOffset = new Vector3(0, 2, 0);
  private readonly followDistance = 9;
  private readonly lerpSpeed = 0.1;

  constructor(private scene: Scene) {
    this.targetPosition = new Vector3(0, 5, 0); // this.playerMesh.position.clone();
    this.currentAngleY = 0; // this.getPlayerAngleY();

    this.camera = new FreeCamera(
      "CameraFollow",
      new Vector3(0, this.followHeight, 0),
      scene,
    );
    this.camera.inputs.clear(); // Disable manual controls
    this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);
  }

  public setPlayerMesh(mesh: Mesh): void {
    this.playerMesh = mesh;
    this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  private getPlayerAngleY(): number {
    const quat = this.playerMesh.absoluteRotationQuaternion;
    if (!quat) return this.playerMesh.rotation.y;

    return quat.toEulerAngles().y;
  }

  private update(): void {
    const playerPos = this.playerMesh.absolutePosition;
    const targetAngleY = this.getPlayerAngleY();

    // Lerp position
    this.targetPosition = Vector3.Lerp(
      this.targetPosition,
      playerPos.add(this.followOffset),
      this.lerpSpeed,
    );

    // Lerp angleY with wraparound handling
    const angleDiff = Scalar.NormalizeRadians(
      targetAngleY - this.currentAngleY,
    );
    this.currentAngleY += Scalar.Clamp(
      angleDiff,
      -this.lerpSpeed,
      this.lerpSpeed,
    );

    // Calculate final camera position
    const offsetDirection = new Vector3(
      -Math.sin(this.currentAngleY),
      0,
      -Math.cos(this.currentAngleY),
    ).scale(this.followDistance);

    const cameraPos = this.targetPosition
      .add(new Vector3(0, this.followHeight, 0))
      .add(offsetDirection);

    this.camera.position = cameraPos;
    this.camera.setTarget(this.targetPosition);
  }

  public getCamera(): FreeCamera {
    return this.camera;
  }
}
