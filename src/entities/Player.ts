import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  PhysicsImpostor,
  Ray,
  AnimationGroup,
  LoadAssetContainerAsync,
} from "@babylonjs/core";

import "@babylonjs/loaders/glTF/index.js";

import { InputSystem } from "../systems/InputSystem.js";
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

export class Player {
  public mesh!: Mesh;
  private collider!: Mesh;

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

  constructor(private scene: Scene) {}

  static async Create(scene: Scene): Promise<Player> {
    const player = new Player(scene);

    // 📦 Load visual assets
    const container = await LoadAssetContainerAsync(
      R.models.patrick_testglb(),
      scene,
    );
    container.addAllToScene();

    // 🔍 Find the main mesh for the player
    const visualMesh = container.meshes[0] as Mesh;

    console.log(
      `List of meshes in container:`,
      container.meshes.map((m) => m.name),
    );

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
      scene,
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
      scene,
    );

    // 🎯 Attach relevant parts to player object
    player.mesh = collider;
    player.collider = collider;

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
    player.animations = Object.fromEntries(
      Object.entries(animMap).map(([key, value]) => {
        const animGroup = container.animationGroups.find(
          (g) => g.name === value,
        );
        return [key, animGroup!];
      }),
    ) as PlayerAnimations;

    // enable blending 0.05 for all animations
    Object.values(player.animations).forEach((anim: AnimationGroup) => {
      if (anim) {
        anim.enableBlending = true;
        anim.blendingSpeed = 0.05;
      }
    });

    // 2x speed for fallingtolanding
    player.animations.fallingToLand!.speedRatio = 2;

    // 🎥 Start with idle animation
    player.playAnimation(player.animations?.idle);

    // create material for the bodymesh
    const bodyMaterial = new StandardMaterial("bodyMat", scene);
    bodyMaterial.diffuseColor = new Color3(1, 0.8, 0.6); // Light skin tone
    bodyMesh.material = bodyMaterial;

    // 🏃‍♂️ Setup ground check
    scene.onBeforeRenderObservable.add(() => {
      const origin = collider.position.clone();

      origin.y -= size.y / 2 + 0.2; // Adjust for collider height
      const ray = new Ray(origin, Vector3.Down(), player.groundCheckRayLength);
      const hit = scene.pickWithRay(
        ray,
        (m) => m !== collider && !m.name.startsWith("Sphere.001"),
      );
      player.nearGround = !!hit?.hit;

      const ray2 = new Ray(origin, Vector3.Down(), player.groundCheckDistance);
      const hit2 = scene.pickWithRay(
        ray2,
        (m) => m !== collider && !m.name.startsWith("Sphere.001"),
      );
      player.grounded = !!hit2?.hit;

      player.update();
    });

    player.collider.physicsImpostor?.registerBeforePhysicsStep(() => {
      player.collider.physicsImpostor?.setAngularVelocity(Vector3.Zero());
    });

    return player;
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

  update() {
    if (!this.collider) return;

    const dt = this.scene.getEngine().getDeltaTime() / 1000;

    const moveDir = new Vector3();

    let backwards = false;

    if (InputSystem.inputMap["w"]) moveDir.z += 1;
    if (InputSystem.inputMap["s"]) {
      moveDir.z -= 1;
      backwards = true;
    }

    if (InputSystem.inputMap["a"]) {
      this.collider.rotate(Vector3.Up(), -this.rotationSpeed * dt);
    }
    if (InputSystem.inputMap["d"]) {
      this.collider.rotate(Vector3.Up(), this.rotationSpeed * dt);
    }

    if (moveDir.length() > 0) {
      moveDir.normalize();
      const fwd = this.collider.forward;
      const right = this.collider.right;

      const direction = fwd
        .scale(moveDir.z)
        .add(right.scale(moveDir.x))
        .scale(this.moveSpeed * dt * (this.nearGround ? 1 : 0.3));

      this.collider.moveWithCollisions(direction);
      if (this.grounded) this.playAnimation(this.animations?.walk);
      this.animations!.walk!.speedRatio = backwards ? -1 : 1;
    } else {
      if (this.grounded) this.playAnimation(this.animations?.idle);
    }

    const velocity = this.collider.physicsImpostor?.getLinearVelocity();
    if (
      InputSystem.inputMap[" "] &&
      this.nearGround &&
      velocity &&
      velocity.y >= 0 &&
      !(this.currentAnim == this.animations?.fallingToLand)
    ) {
      this.collider.physicsImpostor!.friction = 0; // reduce friction while jumping

      const impulse = new Vector3(0, this.jumpStrength, 0);
      this.collider.physicsImpostor?.applyImpulse(
        impulse,
        this.collider.getAbsolutePosition(),
      );

      if (!this.jumping)
        this.playAnimation(
          this.animations?.jumpUp,
          this.animations?.fallingIdle,
        );
      this.jumping = true;
    }

    // else if to ensure this code block doesnt run if the previous condition was true
    else if (this.jumping && this.grounded) {
      this.jumping = false;
      this.playAnimation(this.animations?.fallingToLand, this.animations?.idle);
      this.collider.physicsImpostor!.friction = 0.2; // reset friction after landing
    }

    if (!this.jumping && !this.grounded) {
      // means player is falling without pressing space
      this.playAnimation(this.animations?.fallingIdle);
    }
  }
}
