import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

// UI-only settings. Records, party, hunt and assistant state live in src/data.

export type ShareInterval = "30 s" | "60 s" | "120 s";

interface AppState {
  shareInterval: ShareInterval;
  setShareInterval: (value: ShareInterval) => void;
}

const Ctx = createContext<AppState | null>(null);
const KEY = "maplehunt.shareInterval";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [shareInterval, setInterval] = useState<ShareInterval>(() => (localStorage.getItem(KEY) as ShareInterval | null) ?? "60 s");
  const value = useMemo<AppState>(
    () => ({
      shareInterval,
      setShareInterval: (v) => {
        localStorage.setItem(KEY, v);
        setInterval(v);
      },
    }),
    [shareInterval],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(Ctx);
  if (!state) throw new Error("useAppState must be used inside <AppStateProvider>");
  return state;
}
