import { Navigate, Route, Routes } from "react-router";
import { signOut, useAuthUser } from "./auth/auth";
import { BottomNav } from "./components/BottomNav";
import { OfflineBadge } from "./components/OfflineBadge";
import { AssistantScreen } from "./screens/AssistantScreen";
import { LogScreen } from "./screens/LogScreen";
import { MapScreen } from "./screens/MapScreen";
import { PartyScreen } from "./screens/PartyScreen";
import { SignInScreen } from "./screens/SignInScreen";

export function App() {
  const user = useAuthUser();

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">MapleHunt</span>
        <div className="header-actions">
          <OfflineBadge />
          {user && (
            <button type="button" className="header-button" onClick={() => void signOut()}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <main className="app-main">
        {user ? (
          <Routes>
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route path="/map" element={<MapScreen />} />
            <Route path="/party" element={<PartyScreen />} />
            <Route path="/log" element={<LogScreen />} />
            <Route path="/assistant" element={<AssistantScreen />} />
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        ) : (
          <SignInScreen />
        )}
      </main>
      {user && <BottomNav />}
    </div>
  );
}
