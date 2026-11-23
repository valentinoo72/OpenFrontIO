import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { GameConfigPatch } from "@openfront/engine-api/Schemas";
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const presenceMocks = vi.hoisted(() => ({
  isAvailable: vi.fn(() => false),
  openInviteDialog: vi.fn(async () => true),
}));

// The desktop bridge is absent in a browser and in jsdom. Mocking the module
// lets each test state which shell it is running in, which is the only thing
// the invite button is gated on.
vi.mock("../../src/client/DesktopPresence", () => ({
  desktopPresence: {
    isAvailable: presenceMocks.isAvailable,
    openInviteDialog: presenceMocks.openInviteDialog,
    set: vi.fn(),
    consumePendingInvite: vi.fn(async () => null),
    subscribeInvites: vi.fn(() => () => undefined),
  },
}));

import { HostLobbyModal } from "../../src/client/HostLobbyModal";

// The host holds the lobby code and decides who joins, so they are the player
// most likely to want this — and they were the one surface the button missed
// when it first shipped, because it lived inline in JoinLobbyModal. The
// gating and wiring are pinned here; whether Steam's dialog actually renders
// needs a packaged build, per OPE-200's acceptance criterion.
describe("HostLobbyModal Steam invite button", () => {
  const INVITE = "[data-test-invite-friends]";
  const COPY = "copy-button";

  function renderHeader(modal: HostLobbyModal): HTMLElement {
    const container = document.createElement("div");
    render(
      (
        modal as unknown as { renderHeaderSlot(): unknown }
      ).renderHeaderSlot() as never,
      container,
    );
    return container;
  }

  function hostModal(): HostLobbyModal {
    const modal = new HostLobbyModal();
    (modal as unknown as { lobbyId: string }).lobbyId = "ABCD1234";
    return modal;
  }

  beforeEach(() => {
    presenceMocks.isAvailable.mockReset().mockReturnValue(false);
    presenceMocks.openInviteDialog.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is absent in a browser, leaving the copy button alone", () => {
    presenceMocks.isAvailable.mockReturnValue(false);
    const header = renderHeader(hostModal());

    expect(header.querySelector(INVITE)).toBeNull();
    expect(header.querySelector(COPY)).not.toBeNull();
  });

  // createLobby() assigns lobbyId asynchronously and this modal renders before
  // it lands. A button live in that window has no shadow lobby behind it, so
  // the invite would silently no-op.
  it("is absent until the lobby id lands, even on the desktop shell", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const modal = new HostLobbyModal();

    expect(renderHeader(modal).querySelector(INVITE)).toBeNull();
  });

  it("appears beside the copy button on the desktop shell", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const header = renderHeader(hostModal());

    expect(header.querySelector(INVITE)).not.toBeNull();
    expect(header.querySelector(COPY)).not.toBeNull();
  });

  it("opens the Steam invite dialog when clicked", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const button =
      renderHeader(hostModal()).querySelector<HTMLButtonElement>(INVITE);

    button?.click();

    expect(presenceMocks.openInviteDialog).toHaveBeenCalledOnce();
  });
});

describe("HostLobbyModal KOTH map selection", () => {
  it.each([false, true])(
    "restores the previous map and Random Map setting (%s)",
    async (useRandomMap) => {
      const modal = new HostLobbyModal();
      const state = modal as unknown as {
        selectedMap: GameMapType;
        useRandomMap: boolean;
        handleConfigOptionToggleChanged(event: Event): void;
        handleMapSelection(map: GameMapType): Promise<void>;
        loadNationCount(): Promise<void>;
        constructUrl(): Promise<string>;
        updateLobbyHistory(url: string): void;
      };
      state.selectedMap = GameMapType.Europe;
      state.useRandomMap = useRandomMap;
      vi.spyOn(state, "loadNationCount").mockResolvedValue(undefined);
      vi.spyOn(state, "constructUrl").mockResolvedValue("http://localhost/");
      vi.spyOn(state, "updateLobbyHistory").mockImplementation(() => {});
      let lastConfig: GameConfigPatch | undefined;
      modal.addEventListener("update-game-config", (event) => {
        lastConfig = (event as CustomEvent<{ config: GameConfigPatch }>).detail
          .config;
      });
      const toggleKoth = (checked: boolean) => {
        state.handleConfigOptionToggleChanged(
          new CustomEvent("option-toggle-changed", {
            detail: { labelKey: "king_of_the_hill.name", checked },
          }),
        );
      };

      toggleKoth(true);
      expect(state.selectedMap).toBe(GameMapType.Tourney3);
      await state.handleMapSelection(GameMapType.IrishSea);
      await vi.waitFor(() => {
        expect(lastConfig).toMatchObject({
          kingOfTheHill: true,
          gameMap: GameMapType.IrishSea,
        });
      });

      toggleKoth(false);
      expect(state.selectedMap).toBe(GameMapType.Europe);
      expect(state.useRandomMap).toBe(useRandomMap);
      await vi.waitFor(() => {
        expect(lastConfig).toMatchObject({
          kingOfTheHill: false,
          gameMap: GameMapType.Europe,
        });
      });
    },
  );
});
