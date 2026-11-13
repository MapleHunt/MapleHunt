import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuthUser } from "./data/auth";
import { startAutoSync } from "./data/sync";
import { useIsDesktop } from "./hooks/useMediaQuery";
import { DesktopShell } from "./layout/DesktopShell";
import { MobileShell } from "./layout/MobileShell";
import { SignInScreen } from "./screens/auth/SignInScreen";
import { AssistantPage } from "./screens/desktop/AssistantPage";
import { DashboardPage } from "./screens/desktop/DashboardPage";
import { HarvestLogPage } from "./screens/desktop/HarvestLogPage";
import { MapPacksPage } from "./screens/desktop/MapPacksPage";
import { MapPage } from "./screens/desktop/MapPage";
import { PartyPage } from "./screens/desktop/PartyPage";
import { SettingsPage } from "./screens/desktop/SettingsPage";
import { AssistantScreen } from "./screens/mobile/AssistantScreen";
import { LogHarvestScreen } from "./screens/mobile/LogHarvestScreen";
import { MapScreen } from "./screens/mobile/MapScreen";
import { MoreScreen } from "./screens/mobile/MoreScreen";
import { PartyInviteScreen } from "./screens/mobile/PartyInviteScreen";
import { PartyScreen } from "./screens/mobile/PartyScreen";
import { JoinPartyScreen } from "./screens/shared/JoinPartyScreen";

export function App() {
  const desktop = useIsDesktop();
  const user = useAuthUser();

  useEffect(() => {
    if (!user) return;
    return startAutoSync();
  }, [user?.id]);

  if (!user) return <SignInScreen />;

  if (desktop) {
    return (
      <DesktopShell>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/party" element={<PartyPage />} />
          <Route path="/log" element={<HarvestLogPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/map-packs" element={<MapPacksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/join/:code" element={<JoinPartyScreen />} />
          <Route path="/party/invite" element={<Navigate to="/party" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </DesktopShell>
    );
  }

  return (
    <MobileShell>
      <Routes>
        <Route path="/map" element={<MapScreen />} />
        <Route path="/party" element={<PartyScreen />} />
        <Route path="/party/invite" element={<PartyInviteScreen />} />
        <Route path="/log" element={<LogHarvestScreen />} />
        <Route path="/assistant" element={<AssistantScreen />} />
        <Route path="/more" element={<MoreScreen />} />
        <Route path="/join/:code" element={<JoinPartyScreen />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </MobileShell>
  );
}
