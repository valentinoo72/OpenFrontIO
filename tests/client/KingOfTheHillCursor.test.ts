import {
  BuildableUnit,
  GameMapSize,
  GameMapType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildPreviewController } from "../../src/client/controllers/BuildPreviewController";
import {
  ContextMenuEvent,
  InputHandler,
  MouseMoveEvent,
  PlaceHoveredThroneEvent,
  UnitSelectionEvent,
} from "../../src/client/InputHandler";
import settings from "../../src/client/render/gl/render-settings.json";
import { BuildUnitIntentEvent } from "../../src/client/Transport";
import { kothFiles } from "../util/kothMaps";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

async function setup(owner = 1, size = GameMapSize.Normal) {
  const raf = vi.fn((_callback: FrameRequestCallback) => 1);
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const { gameMap: map } = await loadTerrainMap(
    kothFiles(GameMapType.Luna, size),
  );
  const x = size === GameMapSize.Normal ? 656 : 328;
  const y = size === GameMapSize.Normal ? 1750 : 875;
  const tile = map.ref(x, y);
  const throne: BuildableUnit = {
    type: UnitType.Throne,
    cost: 2_000_000n,
    canBuild: tile,
    canUpgrade: false,
    overlappingRailroads: [],
    ghostRailPaths: [],
  };
  const player = {
    isAlive: () => true,
    smallID: () => 1,
    gold: () => 3_000_000n,
    units: () => [],
    buildables: vi.fn(async () => [throne]),
  };
  const game = Object.assign(map, {
    config: () => ({
      isKingOfTheHill: () => true,
      gameConfig: () => ({ gameMap: GameMapType.Luna, gameMapSize: size }),
    }),
    inSpawnPhase: () => false,
    gameOver: () => false,
    isSpawnImmunityActive: () => false,
    myPlayer: () => player,
    ownerID: () => owner,
    units: () => [],
    players: () => [player],
  });
  const bus = new EventBus();
  const build = vi.fn(),
    contextMenu = vi.fn();
  bus.on(BuildUnitIntentEvent, build);
  bus.on(ContextMenuEvent, contextMenu);
  const view = {
    updateGhostPreview: vi.fn(),
    updateNukeTrajectory: vi.fn(),
    getSettings: () => settings,
  };
  const uiState = { ghostStructure: null as UnitType | null };
  const canvas = document.createElement("div");
  document.body.append(canvas);
  const input = new InputHandler(game as any, uiState as any, canvas, bus);
  input.initialize();
  const controller = new BuildPreviewController(
    game as any,
    bus,
    uiState as any,
    {
      scale: 3,
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      screenToWorldCoordinatesFloat: (x: number, y: number) => ({ x, y }),
    } as any,
    view as any,
    { cursorCostLabel: () => true, snapBuildPreview: () => false } as any,
    GameMapType.Luna,
    size,
  );
  controller.init();
  cleanups.push(() => {
    controller.dispose();
    input.destroy();
    canvas.remove();
  });
  const move = (mx = x, my = y) => bus.emit(new MouseMoveEvent(mx, my));
  const frame = () => raf.mock.calls[raf.mock.calls.length - 1]![0](0);
  const rightClick = () =>
    canvas.dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: x,
        clientY: y,
        button: 2,
        cancelable: true,
      }),
    );
  return {
    bus,
    build,
    contextMenu,
    view,
    player,
    controller,
    input,
    uiState,
    throne,
    x,
    y,
    move,
    frame,
    rightClick,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Automatic throne cursor", () => {
  it.each([GameMapSize.Normal, GameMapSize.Compact])(
    "previews and places on owned land on %s",
    async (size) => {
      const c = await setup(1, size);
      c.move();
      await flush();
      c.frame();
      expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ghostType: UnitType.Throne,
          canBuild: true,
          cost: 2_000_000,
        }),
      );
      const click = new PlaceHoveredThroneEvent(c.x, c.y);
      c.bus.emit(click);
      await flush();
      expect(click.handled).toBe(true);
      expect(c.build).toHaveBeenCalledOnce();
      c.move(0, 0);
      expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(null);
    },
  );

  it.each([
    [0, "neutral"],
    [2, "enemy"],
    [3, "teammate"],
  ] as const)(
    "never previews or queries on %s (%s) territory",
    async (owner, _relationship) => {
      const c = await setup(owner);
      c.move();
      await flush();
      c.frame();
      expect(c.player.buildables).not.toHaveBeenCalled();
      expect(
        c.view.updateGhostPreview.mock.calls.every(([data]) => data === null),
      ).toBe(true);
      const click = new PlaceHoveredThroneEvent(c.x, c.y);
      c.bus.emit(click);
      await flush();
      expect(click.handled).toBe(false);
      expect(c.build).not.toHaveBeenCalled();
    },
  );

  it("right-click dismisses until leaving and re-entering the site", async () => {
    const c = await setup();
    c.move();
    await flush();
    c.frame();
    c.rightClick();
    expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(null);
    expect(c.contextMenu).not.toHaveBeenCalled();
    c.move(c.x + 1, c.y);
    c.controller.tick();
    await flush();
    c.frame();
    expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(null);
    const click = new PlaceHoveredThroneEvent(c.x, c.y);
    c.bus.emit(click);
    await flush();
    expect(click.handled).toBe(false);
    expect(c.build).not.toHaveBeenCalled();
    c.move(0, 0);
    c.move();
    await flush();
    c.frame();
    expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ ghostType: UnitType.Throne }),
    );
  });

  it("a pending preview query cannot resurrect a cancelled throne", async () => {
    const c = await setup();
    let resolve!: (units: BuildableUnit[]) => void;
    c.player.buildables.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    c.move();
    c.rightClick();
    resolve([c.throne]);
    await flush();
    c.frame();
    expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(null);
    expect(c.build).not.toHaveBeenCalled();
  });

  it("right-click cancels a throne placement while its validation is pending", async () => {
    const c = await setup();
    c.move();
    await flush();
    let resolve!: (units: BuildableUnit[]) => void;
    c.player.buildables.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const click = new PlaceHoveredThroneEvent(c.x, c.y);
    c.bus.emit(click);
    expect(click.handled).toBe(true);
    c.rightClick();
    resolve([c.throne]);
    await flush();
    expect(c.build).not.toHaveBeenCalled();
    expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(null);
  });

  it("right-click also suppresses automatic reacquisition after selecting a throne explicitly", async () => {
    const c = await setup();
    c.uiState.ghostStructure = UnitType.Throne;
    c.move();
    await flush();
    c.rightClick();
    c.controller.tick();
    await flush();
    c.frame();
    expect(c.uiState.ghostStructure).toBeNull();
    expect(c.view.updateGhostPreview).toHaveBeenLastCalledWith(null);
    expect(c.contextMenu).not.toHaveBeenCalled();
  });

  it("keeps normal structure cancellation, warship cancellation and the ordinary context menu", async () => {
    const c = await setup();
    c.uiState.ghostStructure = UnitType.City;
    c.rightClick();
    expect(c.uiState.ghostStructure).toBeNull();
    expect(c.contextMenu).not.toHaveBeenCalled();
    const selections = vi.fn();
    c.bus.on(UnitSelectionEvent, selections);
    c.bus.emit(new UnitSelectionEvent({} as any, true));
    selections.mockClear();
    c.rightClick();
    expect(selections).toHaveBeenCalledWith(
      new UnitSelectionEvent(null, false),
    );
    c.rightClick();
    expect(c.contextMenu).toHaveBeenCalledOnce();
  });
});
