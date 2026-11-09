import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <span className="offline-badge" role="status">
      Offline
    </span>
  );
}
