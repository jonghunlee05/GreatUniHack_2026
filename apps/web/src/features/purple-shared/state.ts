"use client";

import { useCallback, useEffect, useState } from "react";
import type { Game } from "@/lib/game-schema";
import { initialState, type PurpleState } from "./types";

function storageKey(gameId: string) {
  return `teachback:purple:v1:${gameId}`;
}

export function usePurpleState(game: Game) {
  const [state, setState] = useState<PurpleState>(() => initialState(game));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey(game.id));
      if (saved) setState(JSON.parse(saved) as PurpleState);
    } catch {
      // Corrupt or blocked local storage must never make the room unplayable.
    }
    setReady(true);
  }, [game.id]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(storageKey(game.id), JSON.stringify(state));
  }, [game.id, ready, state]);

  const update = useCallback((recipe: (current: PurpleState) => PurpleState) => {
    setState((current) => recipe(current));
  }, []);

  return { state, update, ready };
}
