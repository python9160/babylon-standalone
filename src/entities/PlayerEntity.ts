import {
  Scene,
  AssetContainer,
  Mesh,
  AnimationGroup,
  MeshBuilder,
  Vector3,
  StandardMaterial,
  Color3,
  PhysicsImpostor,
} from "@babylonjs/core";

import { Entity } from "../engine/Entity.js";
import { R } from "../engine/R.js";

interface PlayerAnimations {
  idle: AnimationGroup | undefined;
  walk: AnimationGroup | undefined;
  jumpUp: AnimationGroup | undefined;
  fallingIdle: AnimationGroup | undefined;
  fallingToLand: AnimationGroup | undefined;
  strafeLeft: AnimationGroup | undefined;
  strafeRight: AnimationGroup | undefined;
  strafeRunLeft: AnimationGroup | undefined;
  strafeRunRight: AnimationGroup | undefined;
}

export class PlayerEntity extends Entity {
  static readonly modelPath = R.models.patrick_testglb;

  private rotationSpeed = 2.5;
  private moveSpeed = 5;
  private jumpStrength = 0.8;

  private grounded = false; // checks if player is very close to the ground
  private readonly groundCheckDistance = 0.3; // distance to check for ground
  private nearGround = false; // checks if player is close enough the ground
  private readonly groundCheckRayLength = 1.4; // length of the ray to check for ground
  private jumping = false; // checks if player is jumping

  private animations?: PlayerAnimations;
  private currentAnim?: AnimationGroup;
  private animationChainBlocked = false; // blocks calls to playAnimation without a link

  protected update(): void {
    // Implement player-specific update logic here
  }

  protected onLoaded(container: AssetContainer): void {
    // Set up player mesh or other properties after loading
    const visualMesh = container.meshes[0] as Mesh; // Example: use the first mesh in the container

    const bodyMesh = container.meshes.find((m) => m instanceof Mesh) as
      | Mesh
      | undefined;

    if (!bodyMesh) {
      throw new Error("Body mesh 'Sphere.001_primitive2' not found");
    }

    // 📐 Compute bounds and build collider box
    const boundingInfo = bodyMesh.getBoundingInfo();
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;
    const size = max.subtract(min);
    const center = min.add(size.scale(0.5));

    const collider = MeshBuilder.CreateBox(
      "playerCollider",
      {
        width: size.x,
        height: size.y,
        depth: size.z,
      },
      this.scene,
    );
    collider.position = center;
    collider.isVisible = false;

    // 🧩 Parent visual mesh to collider for physics
    visualMesh.parent = collider;
    visualMesh.position.y = -1.577; // Adjust visual mesh position to align with collider

    // 🚀 Assign physics impostor
    collider.position = new Vector3(0, 10, 0); // start above ground

    collider.physicsImpostor = new PhysicsImpostor(
      collider,
      PhysicsImpostor.BoxImpostor,
      { mass: 1, restitution: 0.2, friction: 0 },
      this.scene,
    );

    // 🎯 Attach relevant parts to player object
    this.mesh = collider;
    this.collider = collider;

    // 🎬 Grab animations from container
    console.log(
      "Available animations:",
      container.animationGroups.map((g) => g.name),
    );

    const animMap: Partial<Record<keyof PlayerAnimations, string>> = {
      idle: "BreathingIdle",
      walk: "Walk",
      jumpUp: "JumpingUp",
      fallingIdle: "FallingIdle",
      fallingToLand: "FallingToLanding",
      strafeLeft: "LeftStrafe",
      strafeRight: "RightStrafe",
      strafeRunLeft: "LeftStrafe_",
      strafeRunRight: "RightStrafe_",
    };
    // @ts-ignore
    this.animations = Object.fromEntries(
      Object.entries(animMap).map(([key, value]) => {
        const animGroup = container.animationGroups.find(
          (g) => g.name === value,
        );
        return [key, animGroup!];
      }),
    ) as PlayerAnimations;

    // enable blending 0.05 for all animations
    Object.values(this.animations).forEach((anim: AnimationGroup) => {
      if (anim) {
        anim.enableBlending = true;
        anim.blendingSpeed = 0.05;
      }
    });

    // 2x speed for fallingtolanding
    this.animations.fallingToLand!.speedRatio = 2;

    // 🎥 Start with idle animation
    this.playAnimation(this.animations?.idle);

    // create material for the bodymesh
    const bodyMaterial = new StandardMaterial("bodyMat", this.scene);
    bodyMaterial.diffuseColor = new Color3(1, 0.8, 0.6); // Light skin tone
    bodyMesh.material = bodyMaterial;
  }

  private playAnimation(anim?: AnimationGroup, link?: AnimationGroup) {
    if (this.animationChainBlocked) {
      // If animation chain is blocking the system, do not play any new animations
      return;
    }
    if (!anim || this.currentAnim === anim) return;
    this.currentAnim?.stop();
    anim.start(!link); // do not loop if link is provided
    if (link) {
      anim.onAnimationGroupEndObservable.add(
        () => {
          link.start(true);
          this.currentAnim = link;
          // unblock the system after the link is started
          this.animationChainBlocked = false;
        },
        undefined,
        true,
        undefined,
        true,
      ); // only once
      this.animationChainBlocked = true; // block further calls until the link is played
    }
    this.currentAnim = anim;
  }

  static async Create(scene: Scene): Promise<PlayerEntity> {
    return Entity._Create(scene, PlayerEntity);
  }
}
