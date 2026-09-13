import { R } from "../engine/R";
import { Entity } from "../engine/Entity";
import { Scene } from "@babylonjs/core/scene";
import { Base64String } from "../../types/global";
import {
  AssetContainer,
  Axis,
  GlowLayer,
  Mesh,
  MeshBuilder,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { InputSystem } from "../systems/InputSystem";
import { Observable } from "@babylonjs/core/Misc/observable";

export class Car extends Entity {
  // 0 = front-left, 1 = front-right, 2 = back-left, 3 = back-right
  private wheels: TransformNode[];
  private wheelrotnodes: TransformNode[];
  private wheeldistances: number[] = [0, 0, 0, 0];

  private glow = new GlowLayer("carGlow", this.scene);

  // Car Physics Parameters (Lamborghini Countach Approximation)
  private readonly mass: number = 1350; // Total mass of the car (kg)
  private readonly dragCoefficient: number = 0.42; // Cd value for aerodynamic drag
  private readonly frontalArea: number = 2.2; // Cross-sectional area of the car (m^2)
  private readonly rollingResistanceCoefficient: number = 0.015; // Crr for tire friction/loss
  private readonly airDensity: number = 1.225; // Density of air (kg/m^3)
  private readonly gravity: number = 9.81; // Acceleration due to gravity (m/s^2)
  private readonly frictionCoefficient: number = 1.3; // Coefficient of friction between tires and road (Adjusted for high-grip tires)
  private readonly maxBrakeForce: number = 24000; // Maximum braking force (Newtons)
  private readonly drivetrainDrag: number = 600; // Drag from drivetrain/engine when coasting (Newtons)

  // --- Drivetrain Torque & Gear Constants (UPDATED with real Countach ratios) ---
  private readonly maxTorque: number = 600; // UPDATED: Max engine torque (Nm) - More realistic Countach value
  private readonly maxRPM: number = 8000; // Max engine RPM
  private readonly wheelRadius: number = 0.35; // Radius of the driving wheels (m)
  private readonly finalDriveRatio: number = 4.09; // UPDATED: Final Drive Ratio
  // UPDATED: 1st(2.26) to 5th(0.78) gear ratios
  private readonly gearRatios: number[] = [2.26, 1.77, 1.31, 0.99, 0.78];
  private readonly engineBrakeBaseTorque: number = 125; // UPDATED: Base friction torque for engine braking (Nm) - Increased for strong deceleration

  // --- Gear/Clutch State ---
  private currentGearIndex: number = 0; // 0 to 4, used to index gearRatios array (1st to 5th gear)
  private currentGearDisplay: number = 1; // 1 to 5 for forward, -1 for Reverse (New variable)
  public engineRPM: number = 0; // Exposed for HUD
  private clutchInput: number = 1.0; // 1.0 = engaged, 0.0 = disengaged
  private isShifting: boolean = false;
  private readonly shiftTime: number = 0.3; // seconds
  private readonly clutchEngageRate: number = 3.0; // units/second

  // --- Steering & Skid Constants ---
  private readonly maxSteeringAngle: number = Math.PI / 4; // Max steering lock (~30 degrees)
  private readonly skidDurationThreshold: number = 0.5; // Time in seconds at max turn before skidding

  // --- Ackerman Geometry Constants ---
  private radius_front = 1.35686;
  private radius_back = 1.48628;
  private track_front = 3.612;
  private width_front = 0.640683;
  private width_back = 0.750674;
  private track_back = 3.65779;
  private wheelbase = 5.66111;
  private back_axle_to_cg = 2.92428;

  private bottom_to_cg = 1.2197;

  public get Velocity() {
    return this.velocity;
  }
  private velocity: number = 0; // Current forward velocity (m/s)

  public get Acceleration() {
    return this.acceleration;
  }
  private acceleration: number = 0; // Current forward acceleration (m/s²)

  public get Gear(): string {
    // Returns "R" for -1, or the 1-based gear number otherwise.
    return this.currentGearDisplay === -1
      ? "R"
      : this.currentGearDisplay.toString();
  }

  private icr_visual!: Mesh;

  constructor(scene: Scene) {
    super(scene);
    this.wheels = [];
    this.wheelrotnodes = [];

    // Subscribe to InputSystem Observables for single-fire events
    InputSystem.onShiftUp.add(() => {
      this.shiftUp();
    });
    InputSystem.onShiftDown.add(() => {
      this.shiftDown();
    });
  }

  public goToPos(node: TransformNode) {
    this.root.rotation.y = node.rotation.y;
    this.root.position = node.absolutePosition
      .clone()
      .add(this.root.up.scale(this.bottom_to_cg));
    this.root.rotate(Axis.Y, (3 / 2) * Math.PI);
  }

  protected get modelPath(): Base64String {
    return R.models.countachglb();
  }

  // --- Public Gear Methods (Called by InputSystem) ---

  public shiftUp(): void {
    const maxIndex = this.gearRatios.length - 1;
    if (this.isShifting || this.currentGearIndex >= maxIndex) return;

    this.isShifting = true;
    this.clutchInput = 0; // Disengage clutch

    this.currentGearIndex++;
    this.currentGearDisplay = this.currentGearIndex + 1; // Update display

    setTimeout(() => {
      this.isShifting = false;
    }, this.shiftTime * 1000);
  }

  public shiftDown(): void {
    // Prevent shifting down past 1st gear (index 0) for now.
    if (this.isShifting || this.currentGearIndex <= 0) return;

    this.isShifting = true;
    this.clutchInput = 0;

    this.currentGearIndex--;
    this.currentGearDisplay = this.currentGearIndex + 1; // Update display

    setTimeout(() => {
      this.isShifting = false;
    }, this.shiftTime * 1000);
  }

  protected update(dt: number): void {
    // 1. Get Smoothed Input
    const throttle = InputSystem.Throttle; // 0.0 to 1.0
    const steer = -InputSystem.Steer; // -1.0 to 1.0
    const brake = InputSystem.Brake; // 0.0 to 1.0
    const hbrake = InputSystem.Handbrake; // 0.0 to 1.0

    // The angle the user is REQUESTING (max 30 degrees)
    const requestedSteerAngle = steer * this.maxSteeringAngle;

    let targetSteerAngle: number;
    let maxAllowedAngle: number;

    // --- Physics-Based Steering Limit (Friction Constraint) ---

    const L = this.wheelbase;
    const g = this.gravity;
    const mu = this.frictionCoefficient;

    // Velocity used for physics calculation (clamped to prevent division by zero)
    const v = Math.max(Math.abs(this.velocity), 0.1);

    // 1. Calculate the Minimum Stable Turning Radius (R_min) based on friction and speed:
    // R_min = v^2 / (mu * g)
    const minStableRadius = (v * v) / (mu * g);

    // 2. Convert R_min back into a Maximum Allowed Steering Angle (delta_max)
    // delta = atan(L / R)
    maxAllowedAngle = Math.atan(L / minStableRadius);

    // 3. Clamp the maxAllowedAngle to the absolute physical steering lock
    maxAllowedAngle = Math.min(maxAllowedAngle, this.maxSteeringAngle);

    // 4. The angle the car actually uses is limited by friction or max lock
    // We use the limited angle for rotation calculation
    targetSteerAngle = steer * maxAllowedAngle;

    // --- Skid / Drift Check ---

    // Check if the user is requesting more angle than the physics allows
    // AND holding the input for long enough.
    const frictionLimitHit =
      Math.abs(requestedSteerAngle) > maxAllowedAngle + 0.01; // With a small tolerance

    if (
      frictionLimitHit &&
      InputSystem.SteerMaxTime >= this.skidDurationThreshold
    ) {
      console.log("drifting");
      // Here you would implement drift physics (e.g., reduce lateral grip, increase side velocity)
    }

    // --- Gear and Clutch Management ---

    // 1. Smoothly transition clutch state
    const targetClutch = this.isShifting ? 0 : 1;
    const difference = targetClutch - this.clutchInput;
    const maxChange = this.clutchEngageRate * dt;

    if (Math.abs(difference) > maxChange) {
      this.clutchInput += Math.sign(difference) * maxChange;
    } else {
      this.clutchInput = targetClutch;
    }

    // 2. Dynamic Gear Ratio and RPM
    // Only use the gearRatios array if we are in a forward gear (index 0 to 4)
    const gearRatioCurrent =
      (this.currentGearIndex >= 0
        ? this.gearRatios[this.currentGearIndex]
        : 0) * this.finalDriveRatio;

    // Calculate Engine RPM
    this.engineRPM =
      (Math.abs(this.velocity) / (2 * Math.PI * this.wheelRadius)) *
      gearRatioCurrent *
      60;
    this.engineRPM = Math.min(this.engineRPM, this.maxRPM);

    // --- Calculate Forces ---

    // a) Max Tractive Force Limit (F_limit)
    // Only rear wheels are powered, so Normal Force is calculated only for rear axle.
    const normalForceRear = this.mass * this.gravity * 0.5;
    const F_limit = this.frictionCoefficient * normalForceRear; // F_limit = μ * N_rear

    let F_drive = 0; // The primary force from the drivetrain (Throttle, Coast, or Brake)
    let braking = false;

    if (brake > 0.01) {
      // STATE 2: BRAKING (Deceleration) - No Reverse allowed

      if (Math.abs(this.velocity) > 0.1) {
        // Calculate the user-requested braking force
        let F_brake = brake * this.maxBrakeForce; // Use brake input (0-1)
        F_brake = Math.min(F_brake, F_limit);

        // Apply the braking force in the direction opposite to velocity
        F_drive = -F_brake * Math.sign(this.velocity);
      } else {
        F_drive = 0;
      }

      braking = true;
    } else if (throttle > 0.01) {
      // STATE 1: THROTTLE (Torque-Based Acceleration)

      // Calculate Raw Engine Torque (simplification: constant max torque)
      const engineTorque = throttle * this.maxTorque;

      // F_drive = Torque * Total_Ratio / Wheel_Radius
      let F_drive_raw = engineTorque * (gearRatioCurrent / this.wheelRadius);

      // Power cut at redline
      if (this.engineRPM >= this.maxRPM) {
        F_drive_raw = 0;
      }

      // Apply clutch input and cap by grip
      F_drive = F_drive_raw * this.clutchInput;
      F_drive = Math.min(F_drive, F_limit);
    } else {
      // STATE 3: COASTING (ThrottleInput == 0 and Brake == 0)

      if (Math.abs(this.velocity) > 0.1) {
        // Determine the base drag force
        let F_friction_force = this.drivetrainDrag;

        // If clutch is engaged (not shifting) and we are in a forward gear, apply stronger engine braking
        if (this.clutchInput > 0.5 && this.currentGearIndex >= 0) {
          // Calculate Tractive Force from engine friction/braking torque
          // F = Torque * Total_Ratio / Wheel_Radius
          const engineBrakingForce =
            this.engineBrakeBaseTorque * (gearRatioCurrent / this.wheelRadius);

          // We take the max of the base drag and the gear-dependent braking force
          F_friction_force = Math.max(F_friction_force, engineBrakingForce);
        }

        // Apply the friction force opposing velocity
        F_drive = -F_friction_force * Math.sign(this.velocity);
      }
    }

    // c) Air Drag Force
    let F_air = 0;
    if (this.velocity !== 0) {
      F_air =
        -0.5 *
        this.airDensity *
        this.dragCoefficient *
        this.frontalArea *
        this.velocity *
        this.velocity *
        Math.sign(this.velocity);
    }

    // d) Rolling Resistance Force
    let F_roll = 0;
    if (this.velocity !== 0) {
      F_roll =
        -this.rollingResistanceCoefficient *
        this.mass *
        this.gravity *
        Math.sign(this.velocity);
    }

    // e) Total Force
    const F_total = F_drive + F_air + F_roll;

    // --- Apply Physics (F=ma) ---

    this.acceleration = F_total / this.mass;
    this.velocity += this.acceleration * dt;

    // Prevent creeping: if velocity is very small and no throttle/brake, set to zero
    if (
      Math.abs(throttle) < 0.1 &&
      brake < 0.01 &&
      Math.abs(this.velocity) < 0.1
    ) {
      this.velocity = 0;
    }

    this.glow.intensity = braking ? 2.0 : 0.5;

    // --- Wheel Rotation and Steering ---

    if (this.velocity !== 0 || steer !== 0) {
      let outerSteerAngle = 0;
      let innerSteerAngle = 0;

      const linearDistance = this.velocity * dt;

      if (targetSteerAngle !== 0) {
        outerSteerAngle = Math.abs(targetSteerAngle);

        // Recalculate inner angle based on the new, limited outer angle
        innerSteerAngle = Math.atan(
          this.wheelbase /
            (this.wheelbase / Math.tan(outerSteerAngle) - this.track_front)
        );

        // Apply the angles to the visual steering nodes
        this.wheels[0].rotation.z =
          targetSteerAngle > 0 ? outerSteerAngle : -innerSteerAngle; // Front-Left
        this.wheels[1].rotation.z =
          targetSteerAngle > 0 ? innerSteerAngle : -outerSteerAngle; // Front-Right

        const turningRadius = this.wheelbase / Math.tan(outerSteerAngle);
        const icr_local = new Vector3(
          targetSteerAngle > 0 ? -turningRadius : turningRadius,
          0,
          this.back_axle_to_cg
        );

        // Update ICR visual position
        this.icr_visual.position = icr_local;

        const icr_world = Vector3.TransformCoordinates(
          icr_local,
          this.root.getWorldMatrix()
        );

        this.root.rotateAround(
          icr_world,
          this.root.getDirection(Axis.Y),
          (linearDistance / turningRadius) * -Math.sign(targetSteerAngle)
        );

        // Calculate the distance traveled by each wheel (differential speed)
        const leftFrontSpeed =
          (this.velocity * (turningRadius - this.track_front / 2)) /
          turningRadius;
        const rightFrontSpeed =
          (this.velocity * (turningRadius + this.track_front / 2)) /
          turningRadius;

        // Rear wheels use the Rear Track Width, though the geometry is less critical
        const leftBackSpeed =
          (this.velocity * (turningRadius - this.track_back / 2)) /
          turningRadius;
        const rightBackSpeed =
          (this.velocity * (turningRadius + this.track_back / 2)) /
          turningRadius;

        // Re-order based on your index: [FL, FR, BL, BR]
        let wheelDistances = [
          leftFrontSpeed, // FL
          rightFrontSpeed, // FR
          leftBackSpeed, // BL
          rightBackSpeed, // BR
        ];

        // Ensure Inner/Outer is correctly assigned based on the turn direction
        // (The calculation already handles this, but explicitly setting the array order)
        if (targetSteerAngle > 0) {
          // Right Turn: Right is Inner/Slower, Left is Outer/Faster
          wheelDistances = [
            leftFrontSpeed, // FL
            rightFrontSpeed, // FR
            leftBackSpeed, // BL
            rightBackSpeed, // BR
          ];
        } else if (targetSteerAngle < 0) {
          // Left Turn: Left is Inner/Slower, Right is Outer/Faster
          wheelDistances = [
            leftFrontSpeed, // FL
            rightFrontSpeed, // FR
            leftBackSpeed, // BL
            rightBackSpeed, // BR
          ];
        }

        // Update visual wheel rotation
        this.wheeldistances = this.wheeldistances.map(
          (d, i) => d + wheelDistances[i] * dt
        );
      } else {
        // --- Straight Movement (No Steer Input) ---
        this.root.position = this.root.position.add(
          this.root.forward.scale(-linearDistance)
        );

        // All wheels spin the same amount
        const distance = linearDistance;
        this.wheeldistances = this.wheeldistances.map((d) => d + distance);
      }

      // --- 7. Final Wheel Rotation Update ---
      for (let i = 0; i < 4; i++) {
        const radius = i < 2 ? this.radius_front : this.radius_back;
        // The angle in radians is distance traveled divided by radius
        this.wheelrotnodes[i].rotation.x = -this.wheeldistances[i] / radius;
      }
    }
  }

  protected onLoaded(container: AssetContainer): void {
    // find wheels by name "Wheel.FL", "Wheel.FR", "Wheel.BL", "Wheel.BR"
    this.wheels = ["Wheel.FL", "Wheel.FR", "Wheel.BL", "Wheel.BR"].map(
      (name) => container.transformNodes.find((node) => node.name === name)!
    );
    if (this.wheels.length !== 4) {
      console.warn("Could not find all wheels in the car model.");
    }

    this.wheels.forEach((wheel) => {
      wheel.rotationQuaternion = null; // disable quaternions for wheels
    });

    // rotate's are named "Rotation.FL", etc
    this.wheelrotnodes = [
      "Rotation.FL",
      "Rotation.FR",
      "Rotation.BL",
      "Rotation.BR",
    ].map(
      (name) => container.transformNodes.find((node) => node.name === name)!
    );
    if (this.wheelrotnodes.length !== 4) {
      console.warn("Could not find all wheel rotations in the car model.");
    }

    this.wheelrotnodes.forEach((wheel) => {
      wheel.rotationQuaternion = null; // disable quaternions for wheel rotations
    });

    this.setRoot(container.rootNodes[0] as TransformNode);
    if (!this.root) {
      console.warn("Could not find root node of the car model.");
    }

    // let tailLights = container.meshes.filter(
    // 	(mesh) => mesh.name === "TailLights"
    // );
    // if (tailLights.length > 0) {
    // 	this.glow.addIncludedOnlyMesh(tailLights[0] as Mesh);
    // }

    this.root.position.y += 1.2; // lift the car up a bit

    // create sphere to visualize ICR
    this.icr_visual = MeshBuilder.CreateSphere(
      "icr_visual",
      { diameter: 0.5 },
      this.scene
    );
    // parent to car root for easier positioning
    this.icr_visual.parent = this.root;
  }

  static async Create(scene: Scene): Promise<Car> {
    return Entity._Create(scene, Car);
  }
}
