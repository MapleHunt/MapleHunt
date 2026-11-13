import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { GeoProvider } from "./data/geo";
import { AppStateProvider } from "./state/AppState";
import "./styles/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <GeoProvider>
          <App />
        </GeoProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
