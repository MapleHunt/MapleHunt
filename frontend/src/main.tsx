import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { GeoProvider } from "./data/geo";
import { captureInviteFromUrl } from "./data/partyKey";
import { PartyTracker } from "./data/partyRange";
import { AppStateProvider } from "./state/AppState";
import "./styles/base.css";

// Opened from a party invite QR/link: keep it before anything else (e.g. sign-in) runs.
captureInviteFromUrl();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <GeoProvider>
          <PartyTracker />
          <App />
        </GeoProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
