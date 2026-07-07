import { MATCH_TARGETS, MAX_PLAYERS } from "../../shared/constants";
import { MAPS, getMapDefinition } from "../../shared/map";
import { getPlayerClass } from "../../shared/playerClass";
import type { MatchTarget, PlayerAbility, PlayerClass, RoomPhase, RoomSnapshot, RoomSummary } from "../../shared/types";

export type AppScreen = "landing" | "room-lobby" | "in-game";

export interface ClientViewState {
  room: RoomSnapshot | null;
  roomList: RoomSummary[];
  roomListLoading: boolean;
  localPlayerId: string | null;
  nicknameDraft: string;
  roomCodeDraft: string;
  connectionReady: boolean;
  errorMessage: string | null;
}

export interface AppViewModel {
  screen: AppScreen;
  showGameSurface: boolean;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  roomLobby: RoomLobbyViewModel | null;
  gameHud: GameHudViewModel | null;
  form: {
    nickname: string;
    roomCode: string;
    canCreateRoom: boolean;
    canJoinRoom: boolean;
    canRefreshRoomList: boolean;
    roomListLoading: boolean;
    roomList: LandingRoomListItemViewModel[];
    hasRooms: boolean;
    errorMessage: string | null;
  };
}

export interface LandingRoomListItemViewModel {
  code: string;
  hostNickname: string;
  playerCountLabel: string;
  phaseLabel: string;
  mapName: string;
  canJoin: boolean;
}

export interface RoomLobbyViewModel {
  roomCode: string;
  phaseLabel: string;
  phaseMessage: string;
  playerCountLabel: string;
  mapName: string;
  localPlayerClassType: PlayerClass;
  localPlayerClassLabel: string;
  players: LobbyPlayerViewModel[];
  canChangeTarget: boolean;
  canChangeMap: boolean;
  canChangeClass: boolean;
  canStartMatch: boolean;
  canLeaveRoom: boolean;
  targetOptions: Array<{
    value: MatchTarget;
    selected: boolean;
  }>;
  classOptions: Array<{
    id: PlayerClass;
    label: string;
    selected: boolean;
  }>;
  mapOptions: Array<{
    id: RoomSnapshot["mapId"];
    name: string;
    summary: string;
    selected: boolean;
  }>;
}

export interface LobbyPlayerViewModel {
  id: string;
  nickname: string;
  color: string;
  classType: PlayerClass;
  classLabel: string;
  isHost: boolean;
  isLocalPlayer: boolean;
  health: number;
  kills: number;
  waitingForNextRound: boolean;
}

export interface GameHudViewModel {
  roomCode: string;
  phaseLabel: string;
  target: MatchTarget;
  mapName: string;
  localPlayerLabel: string;
  localPlayerClassType: PlayerClass;
  localPlayerClassLabel: string;
  localPlayerStats: string;
  activeAbilityType: PlayerAbility | null;
  activeAbilityLabel: string;
  activeAbilityDetail: string;
  fieldPickupType: PlayerAbility | null;
  fieldPickupLabel: string;
  fieldPickupDetail: string;
  fieldPickupPosition: {
    x: number;
    y: number;
  } | null;
  canLeaveRoom: boolean;
  scoreboard: Array<{
    id: string;
    nickname: string;
    kills: number;
    isWinner: boolean;
    waitingForNextRound: boolean;
  }>;
  banners: string[];
}

export function getVisibleScreen(state: ClientViewState): AppScreen {
  if (!state.room) {
    return "landing";
  }

  return state.room.phase === "lobby" ? "room-lobby" : "in-game";
}

export function createAppViewModel(state: ClientViewState): AppViewModel {
  const screen = getVisibleScreen(state);
  const roomLobby = screen === "room-lobby" ? createRoomLobbyViewModel(state.room!, state.localPlayerId) : null;
  const gameHud = screen === "in-game" ? createGameHudViewModel(state.room!, state.localPlayerId) : null;
  const nickname = state.nicknameDraft;
  const roomCode = state.roomCodeDraft.toUpperCase();

  return {
    screen,
    showGameSurface: screen === "in-game",
    hero: getHeroCopy(screen),
    roomLobby,
    gameHud,
    form: {
      nickname,
      roomCode,
      canCreateRoom: state.connectionReady && nickname.trim().length > 0,
      canJoinRoom: state.connectionReady && nickname.trim().length > 0 && roomCode.trim().length > 0,
      canRefreshRoomList: state.connectionReady && !state.roomListLoading,
      roomListLoading: state.roomListLoading,
      roomList: state.roomList.map((room) => ({
        code: room.code,
        hostNickname: room.hostNickname,
        playerCountLabel: `${room.playerCount}/${MAX_PLAYERS} players`,
        phaseLabel: getPhaseLabel(room.phase),
        mapName: getMapDefinition(room.mapId).name,
        canJoin: room.phase === "lobby"
      })),
      hasRooms: state.roomList.length > 0,
      errorMessage: state.errorMessage
    }
  };
}

const ABILITY_COPY: Record<
  PlayerAbility,
  {
    label: string;
    detailByClass: Record<PlayerClass, string>;
  }
> = {
  ricochet: {
    label: "Ricochet Shot",
    detailByClass: {
      "machine-gunner": "Your bullets bounce off one wall.",
      "laser-gunner": "Your laser path is calculated with one wall bounce.",
      grenadier: "Throw range expands to any legal point on the map."
    }
  },
  speed: {
    label: "Speed Boost",
    detailByClass: {
      "machine-gunner": "Only movement speed is increased.",
      "laser-gunner": "Only movement speed is increased.",
      grenadier: "Only movement speed is increased."
    }
  },
  "heavy-shot": {
    label: "Heavy Shot",
    detailByClass: {
      "machine-gunner": "Your bullets fire at double size.",
      "laser-gunner": "Your laser beam doubles in width.",
      grenadier: "Your blast radius doubles."
    }
  },
  "rapid-fire": {
    label: "Rapid Fire",
    detailByClass: {
      "machine-gunner": "Your fire rate is doubled.",
      "laser-gunner": "Your laser fire interval is halved.",
      grenadier: "Your throw interval is halved."
    }
  }
};

const CLASS_COPY: Record<PlayerClass, string> = {
  "machine-gunner": "Machine Gunner",
  "laser-gunner": "Laser Gunner",
  grenadier: "Grenadier"
};

function createRoomLobbyViewModel(room: RoomSnapshot, localPlayerId: string | null): RoomLobbyViewModel {
  const isHost = room.hostId === localPlayerId;
  const playerCount = Object.keys(room.players).length;
  const selectedMap = getMapDefinition(room.mapId);
  const localPlayer = localPlayerId ? room.players[localPlayerId] : null;
  const localPlayerClassType = getPlayerClass(localPlayer);

  return {
    roomCode: room.code,
    phaseLabel: getPhaseLabel(room.phase),
    phaseMessage: getLobbyPhaseMessage(room, localPlayerId),
    playerCountLabel: `${playerCount}/${MAX_PLAYERS} players`,
    mapName: selectedMap.name,
    localPlayerClassType,
    localPlayerClassLabel: CLASS_COPY[localPlayerClassType],
    players: Object.values(room.players).map((player) => ({
      id: player.id,
      nickname: player.nickname,
      color: player.color,
      classType: getPlayerClass(player),
      classLabel: CLASS_COPY[getPlayerClass(player)],
      isHost: player.id === room.hostId,
      isLocalPlayer: player.id === localPlayerId,
      health: player.health,
      kills: player.kills,
      waitingForNextRound: player.waitingForNextRound
    })),
    canChangeTarget: isHost && room.phase === "lobby",
    canChangeMap: isHost && room.phase === "lobby",
    canChangeClass: Boolean(localPlayer) && room.phase === "lobby",
    canStartMatch: isHost && room.phase === "lobby" && playerCount >= 2,
    canLeaveRoom: Boolean(localPlayerId && room.players[localPlayerId]),
    targetOptions: MATCH_TARGETS.map((value) => ({
      value,
      selected: room.matchTarget === value
    })),
    classOptions: (["machine-gunner", "laser-gunner", "grenadier"] as PlayerClass[]).map((classType) => ({
      id: classType,
      label: CLASS_COPY[classType],
      selected: localPlayerClassType === classType
    })),
    mapOptions: MAPS.map((map) => ({
      id: map.id,
      name: map.name,
      summary: map.summary,
      selected: room.mapId === map.id
    }))
  };
}

function createGameHudViewModel(room: RoomSnapshot, localPlayerId: string | null): GameHudViewModel {
  const localPlayer = localPlayerId ? room.players[localPlayerId] : null;
  const localPlayerClassType = getPlayerClass(localPlayer);
  const localAbility = localPlayer?.ability ?? null;
  const fieldPickup = Object.values(room.activePickups)[0] ?? null;
  const now = Date.now();
  const banners: string[] = [];

  if (localPlayer?.waitingForNextRound) {
    banners.push("Joined mid-match. You will spawn next round.");
  }

  if (localPlayer && !localPlayer.alive && localPlayer.respawnAt) {
    banners.push(`Respawning in ${Math.max(0, Math.ceil((localPlayer.respawnAt - now) / 1_000))}s`);
  }

  if (localPlayer && localPlayer.invulnerableUntil > now) {
    banners.push(`Invulnerable for ${Math.max(0, Math.ceil((localPlayer.invulnerableUntil - now) / 1_000))}s`);
  }

  return {
    roomCode: room.code,
    phaseLabel: getPhaseLabel(room.phase),
    target: room.matchTarget,
    mapName: getMapDefinition(room.mapId).name,
    localPlayerLabel: localPlayer?.nickname ?? "Spectator",
    localPlayerClassType,
    localPlayerClassLabel: CLASS_COPY[localPlayerClassType],
    localPlayerStats: localPlayer ? `${localPlayer.health} HP / ${localPlayer.kills} K` : "Not spawned yet",
    activeAbilityType: localAbility,
    activeAbilityLabel: localAbility ? ABILITY_COPY[localAbility].label : "Standard Loadout",
    activeAbilityDetail: localAbility
      ? ABILITY_COPY[localAbility].detailByClass[localPlayerClassType]
      : "No special ability equipped.",
    fieldPickupType: fieldPickup?.type ?? null,
    fieldPickupLabel: fieldPickup ? ABILITY_COPY[fieldPickup.type].label : "No Field Drop",
    fieldPickupDetail: fieldPickup
      ? ABILITY_COPY[fieldPickup.type].detailByClass[localPlayerClassType]
      : "Waiting for the next five-second spawn.",
    fieldPickupPosition: fieldPickup ? { x: fieldPickup.x, y: fieldPickup.y } : null,
    canLeaveRoom: Boolean(localPlayer),
    scoreboard: Object.values(room.players)
      .sort((left, right) => right.kills - left.kills || left.nickname.localeCompare(right.nickname))
      .map((player) => ({
        id: player.id,
        nickname: player.nickname,
        kills: player.kills,
        isWinner: player.id === room.winnerId,
        waitingForNextRound: player.waitingForNextRound
      })),
    banners
  };
}

function getHeroCopy(screen: AppScreen) {
  if (screen === "landing") {
    return {
      eyebrow: "Squad Matchmaking",
      title: "Crossfire lobby flow rebuilt for fast room setup.",
      description: "Pick a nickname, create a private room, or jump in with a code. The arena stays hidden until the match actually starts."
    };
  }

  if (screen === "room-lobby") {
    return {
      eyebrow: "Room Lobby",
      title: "Review the squad, lock the target, and launch cleanly.",
      description: "Room setup is separated from gameplay so the host can configure the match without the arena getting in the way."
    };
  }

  return {
    eyebrow: "Match Live",
    title: "The arena is now active.",
    description: "Gameplay HUD stays focused on the round while room setup controls move out of the way."
  };
}

function getLobbyPhaseMessage(room: RoomSnapshot, localPlayerId: string | null) {
  if (room.phase === "celebration") {
    return "Winner celebration is active. The room will reset to lobby flow in a few seconds.";
  }

  if (room.phase === "playing") {
    const localPlayer = localPlayerId ? room.players[localPlayerId] : null;
    if (localPlayer?.waitingForNextRound) {
      return "Match in progress. You joined mid-round and will spawn next round.";
    }

    return "Match in progress.";
  }

  if (Object.keys(room.players).length < 2) {
    return "Waiting for more players before the host can start the match.";
  }

  return "The room is ready. The host can change the kill target and start the match.";
}

function getPhaseLabel(phase: RoomPhase) {
  if (phase === "lobby") {
    return "Lobby";
  }

  if (phase === "celebration") {
    return "Celebration";
  }

  return "Playing";
}
