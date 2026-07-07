import { MATCH_TARGETS } from "../shared/constants";
import type { MatchTarget } from "../shared/types";
import type { GameInstance } from "./game/createGame";
import { createClientSocket } from "./net/clientSocket";
import {
  clearRoomState,
  getClientViewState,
  setRoomListLoading,
  subscribeToClientState,
  updateErrorMessage,
  updateNicknameDraft,
  updateRoomCodeDraft
} from "./state/clientState";
import { createAppViewModel } from "./ui/appViewModel";

export function mountApp(root: HTMLDivElement) {
  const clientSocket = createClientSocket();
  let game: GameInstance | null = null;
  let gameModulePromise: Promise<typeof import("./game/createGame")> | null = null;
  let gameLoadPending = false;
  let gameRenderToken = 0;

  root.innerHTML = `
    <div class="app-shell">
      <section class="hero-panel">
        <div class="hero-backdrop"></div>
        <div class="hero-copy">
          <p id="hero-eyebrow" class="hero-eyebrow"></p>
          <h1 id="hero-title" class="hero-title"></h1>
          <p id="hero-description" class="hero-description"></p>
        </div>
      </section>
      <section class="stage-panel">
        <div id="landing-screen" class="screen"></div>
        <div id="room-lobby-screen" class="screen" hidden></div>
        <div id="game-screen" class="screen" hidden></div>
      </section>
    </div>
  `;

  const appShell = root.querySelector<HTMLElement>(".app-shell");
  const heroEyebrow = root.querySelector<HTMLElement>("#hero-eyebrow");
  const heroTitle = root.querySelector<HTMLElement>("#hero-title");
  const heroDescription = root.querySelector<HTMLElement>("#hero-description");
  const landingScreen = root.querySelector<HTMLElement>("#landing-screen");
  const roomLobbyScreen = root.querySelector<HTMLElement>("#room-lobby-screen");
  const gameScreen = root.querySelector<HTMLElement>("#game-screen");

  if (!appShell || !heroEyebrow || !heroTitle || !heroDescription || !landingScreen || !roomLobbyScreen || !gameScreen) {
    throw new Error("App shell failed to initialize");
  }

  const unsubscribe = subscribeToClientState(() => {
    render();
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.id === "nickname") {
      updateNicknameDraft(target.value);
      return;
    }

    if (target.id === "room-code") {
      const normalized = target.value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 5);
      if (target.value !== normalized) {
        target.value = normalized;
      }
      updateRoomCodeDraft(normalized);
    }
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const state = getClientViewState();
    const room = state.room;
    const actionButton = target.closest<HTMLButtonElement>("button");

    if (actionButton?.id === "create-room") {
      if (!state.nicknameDraft.trim()) {
        focusInput(root, "#nickname");
        return;
      }

      updateErrorMessage(null);
      clientSocket.createRoom(state.nicknameDraft.trim());
      return;
    }

    if (actionButton?.id === "join-room") {
      if (!state.nicknameDraft.trim()) {
        focusInput(root, "#nickname");
        return;
      }

      if (!state.roomCodeDraft.trim()) {
        focusInput(root, "#room-code");
        return;
      }

      updateErrorMessage(null);
      clientSocket.joinRoom(state.roomCodeDraft.trim().toUpperCase(), state.nicknameDraft.trim());
      return;
    }

    if (actionButton?.id === "refresh-room-list") {
      setRoomListLoading(true);
      clientSocket.requestRoomList();
      return;
    }

    if (actionButton?.dataset.roomCode) {
      if (!state.nicknameDraft.trim()) {
        focusInput(root, "#nickname");
        return;
      }

      updateRoomCodeDraft(actionButton.dataset.roomCode);
      updateErrorMessage(null);
      clientSocket.joinRoom(actionButton.dataset.roomCode, state.nicknameDraft.trim());
      return;
    }

    const targetButton = target.closest<HTMLElement>("[data-target-value]");
    if (targetButton?.dataset.targetValue && room) {
      const nextTarget = Number(targetButton.dataset.targetValue) as MatchTarget;
      if (MATCH_TARGETS.includes(nextTarget)) {
        clientSocket.setMatchTarget(room.code, nextTarget);
      }
      return;
    }

    const mapButton = target.closest<HTMLElement>("[data-map-id]");
    if (mapButton?.dataset.mapId && room) {
      clientSocket.setMap(room.code, mapButton.dataset.mapId as typeof room.mapId);
      return;
    }

    const classButton = target.closest<HTMLElement>("[data-class-type]");
    if (classButton?.dataset.classType && room) {
      clientSocket.setPlayerClass(room.code, classButton.dataset.classType as any);
      return;
    }

    if (actionButton?.id === "start-match" && room) {
      clientSocket.startMatch(room.code);
      return;
    }

    if (actionButton?.id === "leave-room" && room) {
      clientSocket.leaveRoom(room.code);
      clearRoomState();
    }
  });

  function render() {
    const model = createAppViewModel(getClientViewState());

    appShell.dataset.screen = model.screen;
    heroEyebrow.textContent = model.hero.eyebrow;
    heroTitle.textContent = model.hero.title;
    heroDescription.textContent = model.hero.description;

    renderLandingScreen(landingScreen, model);
    renderRoomLobbyScreen(roomLobbyScreen, model);
    renderGameScreen(gameScreen, model);

    landingScreen.hidden = model.screen !== "landing";
    roomLobbyScreen.hidden = model.screen !== "room-lobby";
    gameScreen.hidden = model.screen !== "in-game";

    if (model.showGameSurface) {
      const gameRoot = gameScreen.querySelector<HTMLElement>("#game-root");
      if (!game && !gameLoadPending && gameRoot) {
        gameLoadPending = true;
        gameRenderToken += 1;
        const token = gameRenderToken;

        gameModulePromise ??= import("./game/createGame");

        void gameModulePromise.then(({ createGame }) => {
          gameLoadPending = false;

          if (token !== gameRenderToken || game) {
            return;
          }

          const currentModel = createAppViewModel(getClientViewState());
          const currentGameRoot = gameScreen.querySelector<HTMLElement>("#game-root");
          if (!currentModel.showGameSurface || !currentGameRoot) {
            return;
          }

          game = createGame(currentGameRoot);
        });
      }
    } else {
      gameRenderToken += 1;
      gameLoadPending = false;
      if (game) {
        game.destroy(true);
        game = null;
      }
    }
  }

  render();

  return () => {
    unsubscribe();
    gameRenderToken += 1;
    gameLoadPending = false;
    if (game) {
      game.destroy(true);
      game = null;
    }
  };
}

function renderLandingScreen(container: HTMLElement, model: ReturnType<typeof createAppViewModel>) {
  if (model.screen !== "landing" && container.childElementCount > 0) {
    const nicknameInput = container.querySelector<HTMLInputElement>("#nickname");
    const roomCodeInput = container.querySelector<HTMLInputElement>("#room-code");
    if (nicknameInput && nicknameInput.value !== model.form.nickname) {
      nicknameInput.value = model.form.nickname;
    }
    if (roomCodeInput && roomCodeInput.value !== model.form.roomCode) {
      roomCodeInput.value = model.form.roomCode;
    }
    syncErrorBanner(container, model.form.errorMessage);
    syncButtonDisabled(container, "#create-room", !model.form.canCreateRoom);
    syncButtonDisabled(container, "#join-room", !model.form.canJoinRoom);
    syncButtonDisabled(container, "#refresh-room-list", !model.form.canRefreshRoomList);
    syncLandingRoomList(container, model);
    return;
  }

  if (container.childElementCount === 0) {
    container.innerHTML = `
      <div class="landing-card">
        <div class="section-heading">
          <span class="section-kicker">Enter Lobby</span>
          <h2>Set your callsign and room code.</h2>
          <p>The arena stays offline until the room actually launches the match.</p>
        </div>
        <div class="form-grid">
          <label class="field-card">
            <span>Nickname</span>
            <input id="nickname" maxlength="16" placeholder="Nickname" value="${escapeAttribute(model.form.nickname)}" />
          </label>
          <label class="field-card">
            <span>Room code</span>
            <input id="room-code" maxlength="5" placeholder="ABCDE" value="${escapeAttribute(model.form.roomCode)}" />
          </label>
        </div>
        <div class="action-row">
          <button id="create-room" type="button"${model.form.canCreateRoom ? "" : " disabled"}>Create room</button>
          <button id="join-room" class="ghost-button" type="button"${model.form.canJoinRoom ? "" : " disabled"}>Join room</button>
        </div>
        <section class="room-list-panel">
          <div class="room-list-header">
            <div class="section-heading compact">
              <span class="section-kicker">Open Rooms</span>
              <h2>Available rooms</h2>
              <p>Refresh to inspect room status before joining.</p>
            </div>
            <button id="refresh-room-list" class="ghost-button" type="button"${
              model.form.canRefreshRoomList ? "" : " disabled"
            }>
              ${model.form.roomListLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div id="landing-room-list-body" class="room-list-body"></div>
        </section>
        <p class="microcopy">Desktop only. WASD moves, mouse aims, hold click to fire.</p>
        <div class="error-banner" ${model.form.errorMessage ? "" : "hidden"}>${escapeHtml(model.form.errorMessage ?? "")}</div>
      </div>
    `;
    syncLandingRoomList(container, model);
    return;
  }

  syncErrorBanner(container, model.form.errorMessage);
  syncButtonDisabled(container, "#create-room", !model.form.canCreateRoom);
  syncButtonDisabled(container, "#join-room", !model.form.canJoinRoom);
  syncButtonDisabled(container, "#refresh-room-list", !model.form.canRefreshRoomList);
  syncLandingRoomList(container, model);
}

function renderRoomLobbyScreen(container: HTMLElement, model: ReturnType<typeof createAppViewModel>) {
  if (!model.roomLobby) {
    container.innerHTML = "";
    return;
  }

  const lobby = model.roomLobby;
  container.innerHTML = `
    <div class="lobby-layout">
      <section class="lobby-card">
        <div class="section-heading">
          <span class="section-kicker">${escapeHtml(lobby.phaseLabel)}</span>
          <h2 data-testid="room-code">Room ${escapeHtml(lobby.roomCode)}</h2>
          <p>${escapeHtml(lobby.phaseMessage)}</p>
        </div>
        <div class="lobby-summary">
          <div class="metric-card">
            <span>Players</span>
            <strong data-testid="player-count">${escapeHtml(lobby.playerCountLabel)}</strong>
          </div>
          <div class="metric-card">
            <span>Kill target</span>
            <strong>First to ${lobby.targetOptions.find((option) => option.selected)?.value ?? ""}</strong>
          </div>
          <div class="metric-card">
            <span>Map</span>
            <strong>${escapeHtml(lobby.mapName)}</strong>
          </div>
          <div class="metric-card">
            <span>Your class</span>
            <strong data-testid="class-label">${escapeHtml(lobby.localPlayerClassLabel)}</strong>
          </div>
        </div>
        <div class="target-panel">
          <div>
            <h3>Target score</h3>
            <p>Only the room host can change this before the round starts.</p>
          </div>
          <div class="target-grid">
            ${lobby.targetOptions
              .map((option) => {
                const classes = option.selected ? "target-chip is-selected" : "target-chip";
                return `<button class="${classes}" data-target-value="${option.value}" type="button"${
                  lobby.canChangeTarget ? "" : " disabled"
                }>${option.value}</button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="class-panel">
          <div>
            <h3>Class loadout</h3>
            <p>Every player keeps their class between rounds until they deliberately switch it in the lobby.</p>
          </div>
          <div class="class-grid">
            ${lobby.classOptions
              .map((option) => {
                const classes = option.selected ? "class-option is-selected" : "class-option";
                return `
                  <button class="${classes}" data-class-type="${escapeAttribute(option.id)}" type="button"${
                    lobby.canChangeClass ? "" : " disabled"
                  }>
                    <strong>${escapeHtml(option.label)}</strong>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
        <div class="map-panel">
          <div>
            <h3>Map rotation</h3>
            <p>Map changes stay in the lobby so the next round starts with a clean arena state.</p>
          </div>
          <div class="map-grid">
            ${lobby.mapOptions
              .map((option) => {
                const classes = option.selected ? "map-option is-selected" : "map-option";
                return `
                  <button class="${classes}" data-map-id="${escapeAttribute(option.id)}" type="button"${
                    lobby.canChangeMap ? "" : " disabled"
                  }>
                    <strong>${escapeHtml(option.name)}</strong>
                    <span>${escapeHtml(option.summary)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
        <button id="start-match" class="launch-button" type="button"${lobby.canStartMatch ? "" : " disabled"}>Start game</button>
        <button
          id="leave-room"
          class="ghost-button leave-room-button"
          data-testid="leave-room"
          type="button"${lobby.canLeaveRoom ? "" : " disabled"}
        >
          Leave room
        </button>
      </section>
      <section class="roster-card">
        <div class="section-heading compact">
          <span class="section-kicker">Squad</span>
          <h2>Players in room</h2>
        </div>
        <div class="roster-list">
          ${lobby.players
            .map(
              (player) => `
                <article class="roster-row${player.isLocalPlayer ? " is-local" : ""}">
                  <span class="player-swatch" style="background:${escapeAttribute(player.color)}"></span>
                  <div class="player-block">
                    <strong>${escapeHtml(player.nickname)}</strong>
                    <span>${escapeHtml(player.classLabel)} · ${player.kills} K / ${player.health} HP</span>
                  </div>
                  <div class="player-tags">
                    ${player.isHost ? '<span class="status-tag host">Host</span>' : ""}
                    ${player.isLocalPlayer ? '<span class="status-tag">You</span>' : ""}
                    ${player.waitingForNextRound ? '<span class="status-tag warning">Next round</span>' : ""}
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderGameScreen(container: HTMLElement, model: ReturnType<typeof createAppViewModel>) {
  if (!model.gameHud) {
    container.innerHTML = "";
    return;
  }

  const hud = model.gameHud;
  if (!container.querySelector("#game-root")) {
    container.innerHTML = `
      <div class="game-layout">
        <section class="game-stage playfield-shell">
          <div id="game-root" class="game-root"></div>
          <div class="game-stage-frame"></div>
        </section>
        <aside class="game-sidebar">
          <button
            id="leave-room"
            class="ghost-button leave-room-button"
            data-testid="leave-room"
            type="button"${hud.canLeaveRoom ? "" : " disabled"}
          >
            Leave room
          </button>
          <div id="game-hud-stack" class="hud-stack"></div>
          <section class="scoreboard-card">
            <div class="section-heading compact">
              <span class="section-kicker">Scoreboard</span>
              <h2>Live standings</h2>
            </div>
            <div id="scoreboard-list" class="scoreboard-list"></div>
          </section>
          <section id="status-feed" class="status-feed" hidden></section>
        </aside>
      </div>
    `;
  }

  const hudStack = container.querySelector<HTMLElement>("#game-hud-stack");
  const scoreboardList = container.querySelector<HTMLElement>("#scoreboard-list");
  const statusFeed = container.querySelector<HTMLElement>("#status-feed");

  if (!hudStack || !scoreboardList || !statusFeed) {
    throw new Error("Game screen failed to initialize");
  }

  hudStack.innerHTML = `
    <div class="hud-card">
      <span class="hud-label">Room</span>
      <strong>${escapeHtml(hud.roomCode)}</strong>
      <span>${escapeHtml(hud.phaseLabel)}</span>
    </div>
    <div class="hud-card">
      <span class="hud-label">Player</span>
      <strong>${escapeHtml(hud.localPlayerLabel)}</strong>
      <span>${escapeHtml(hud.localPlayerStats)}</span>
    </div>
    <div class="hud-card" data-testid="class-card" data-class-type="${escapeAttribute(hud.localPlayerClassType)}">
      <span class="hud-label">Class</span>
      <strong>${escapeHtml(hud.localPlayerClassLabel)}</strong>
      <span>Chosen lobby loadout</span>
    </div>
    <div
      class="hud-card"
      data-testid="active-ability-card"
      data-ability-type="${escapeAttribute(hud.activeAbilityType ?? "")}"
    >
      <span class="hud-label">Ability</span>
      <strong>${escapeHtml(hud.activeAbilityLabel)}</strong>
      <span>${escapeHtml(hud.activeAbilityDetail)}</span>
    </div>
    <div
      class="hud-card"
      data-testid="field-pickup-card"
      data-pickup-type="${escapeAttribute(hud.fieldPickupType ?? "")}"
      data-pickup-x="${hud.fieldPickupPosition?.x ?? ""}"
      data-pickup-y="${hud.fieldPickupPosition?.y ?? ""}"
    >
      <span class="hud-label">Field Drop</span>
      <strong>${escapeHtml(hud.fieldPickupLabel)}</strong>
      <span>${escapeHtml(hud.fieldPickupDetail)}</span>
    </div>
    <div class="hud-card">
      <span class="hud-label">Target</span>
      <strong>${hud.target}</strong>
      <span>First to target wins</span>
    </div>
    <div class="hud-card">
      <span class="hud-label">Map</span>
      <strong>${escapeHtml(hud.mapName)}</strong>
      <span>Current arena</span>
    </div>
  `;

  scoreboardList.innerHTML = hud.scoreboard
    .map((player) => {
      const suffix = player.isWinner ? " Winner" : player.waitingForNextRound ? " Waiting" : "";
      return `<div class="score-row"><span>${escapeHtml(player.nickname + suffix)}</span><strong>${player.kills}</strong></div>`;
    })
    .join("");

  statusFeed.hidden = hud.banners.length === 0;
  statusFeed.innerHTML = hud.banners
    .map((banner) => `<div class="overlay-banner">${escapeHtml(banner)}</div>`)
    .join("");
}

function focusInput(root: HTMLDivElement, selector: string) {
  root.querySelector<HTMLInputElement>(selector)?.focus();
}

function syncButtonDisabled(container: HTMLElement, selector: string, disabled: boolean) {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (button) {
    button.disabled = disabled;
  }
}

function syncErrorBanner(container: HTMLElement, errorMessage: string | null) {
  const banner = container.querySelector<HTMLElement>(".error-banner");
  if (!banner) {
    return;
  }

  banner.hidden = !errorMessage;
  banner.textContent = errorMessage ?? "";
}

function syncLandingRoomList(container: HTMLElement, model: ReturnType<typeof createAppViewModel>) {
  const body = container.querySelector<HTMLElement>("#landing-room-list-body");
  const refreshButton = container.querySelector<HTMLButtonElement>("#refresh-room-list");
  if (!body || !refreshButton) {
    return;
  }

  refreshButton.textContent = model.form.roomListLoading ? "Refreshing..." : "Refresh";

  if (!model.form.hasRooms) {
    body.innerHTML = `<div class="room-list-empty" data-testid="room-list-empty">No rooms in the list. Refresh to check again.</div>`;
    return;
  }

  body.innerHTML = model.form.roomList
    .map(
      (room) => `
        <article class="room-list-row" data-testid="room-list-row">
          <div class="room-list-meta">
            <strong>${escapeHtml(room.code)}</strong>
            <span>Host ${escapeHtml(room.hostNickname)}</span>
          </div>
          <div class="room-list-meta">
            <strong>${escapeHtml(room.playerCountLabel)}</strong>
            <span>${escapeHtml(room.phaseLabel)}</span>
          </div>
          <div class="room-list-meta">
            <strong>${escapeHtml(room.mapName)}</strong>
            <span>Map</span>
          </div>
          <button
            class="ghost-button room-list-join"
            data-room-code="${escapeAttribute(room.code)}"
            type="button"${room.canJoin ? "" : " disabled"}
          >
            Join
          </button>
        </article>
      `
    )
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
