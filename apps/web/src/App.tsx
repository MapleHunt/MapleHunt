import { Navigate, Route, Routes } from "react-router";
import { BottomNav } from "./components/BottomNav";
import { OfflineBadge } from "./components/OfflineBadge";
import { AssistantScreen } from "./screens/AssistantScreen";
import { LogScreen } from "./screens/LogScreen";
import { MapScreen } from "./screens/MapScreen";
import { PartyScreen } from "./screens/PartyScreen";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">MapleHunt</span>
        <OfflineBadge />
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapScreen />} />
          <Route path="/party" element={<PartyScreen />} />
          <Route path="/log" element={<LogScreen />} />
          <Route path="/assistant" element={<AssistantScreen />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
