import { ActionManager, ExecuteCodeAction, Scene } from "@babylonjs/core";

export class InputSystem {
  private static _current: InputSystem | null = null;

  public static get current(): InputSystem {
    if (!InputSystem._current) {
      throw new Error("InputSystem has not been initialized.");
    }
    return InputSystem._current;
  }

  public static get inputMap(): { [key: string]: boolean } {
    return InputSystem.current.inputMap;
  }

  public static set current(input: InputSystem) {
    InputSystem._current = input;
  }

  public inputMap: { [key: string]: boolean } = {};

  constructor(scene: Scene) {
    scene.actionManager = new ActionManager(scene);

    scene.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnKeyDownTrigger,
        (evt) => (this.inputMap[evt.sourceEvent.key] = true),
      ),
    );

    scene.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnKeyUpTrigger,
        (evt) => (this.inputMap[evt.sourceEvent.key] = false),
      ),
    );
  }
}
