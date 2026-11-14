import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { Avatar, Icon } from "../components/ui";
import { initials, useAuthUser } from "../data/auth";
import { syncLabel, useSyncStatus } from "../data/sync";
import { relativeTime } from "../data/useRecords";
import "./desktop.css";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: "d-side-dashboard.svg", activeIcon: "d1-side-dashboard-active.svg" },
  { to: "/map", label: "Map", icon: "d1-side-map.svg", activeIcon: "d-side-map-active.svg" },
  { to: "/party", label: "Party", icon: "d1-side-party.svg", activeIcon: "d-side-party-active.svg" },
  { to: "/log", label: "Harvest Log", icon: "d1-side-notebook.svg", activeIcon: "d-side-notebook-active.svg" },
  { to: "/assistant", label: "Assistant", icon: "d1-side-messages.svg", activeIcon: "d-side-messages-active.svg" },
  // The design has no active-state icons for these two (they were never selected in a frame).
  { to: "/map-packs", label: "Map Packs", icon: "d1-side-layers.svg", activeIcon: "d1-side-layers.svg" },
  { to: "/settings", label: "Settings", icon: "d1-side-settings.svg", activeIcon: "d1-side-settings.svg" },
];

export function DesktopShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthUser();
  const sync = useSyncStatus();
  const syncText = sync.lastSyncedAt && sync.pending === 0 && sync.phase === "idle" ? `${syncLabel(sync)} · ${relativeTime(sync.lastSyncedAt)}` : syncLabel(sync);
  const name = user?.name ?? "Hunter";
  const title = nav.find((item) => pathname.startsWith(item.to))?.label ?? "Dashboard";

  return (
    <div className="d-app">
      <aside className="d-sidebar">
        <div className="d-logo">
          <Icon name="d1-logo.svg" size={27} />
          MapleHunt
        </div>
        <nav className="d-nav" aria-label="Main">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "d-nav-item d-nav-item-active" : "d-nav-item")}>
              {({ isActive }) => (
                <>
                  <Icon name={isActive ? item.activeIcon : item.icon} size={20} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="d-sidebar-spacer" />
        <div className="d-context">
          <p className="d-context-kicker">ONTARIO · {new Date().getFullYear()} SEASON</p>
          <p className="d-context-text">Plan here. Hunt with mobile.</p>
        </div>
        <button type="button" className="d-account" onClick={() => navigate("/settings")}>
          <Avatar initials={initials(name)} tone="dark" size={36} fontSize={12} />
          <span className="d-account-details">
            <span className="d-account-name">{name}</span>
            <span className="d-account-sub">Personal workspace</span>
          </span>
          <Icon name="d1-chevron-side.svg" size={14} />
        </button>
      </aside>

      <div className="d-workspace">
        <header className="d-topbar">
          <h1 className="d-topbar-title">{title}</h1>
          <label className="d-search">
            <Icon name="d1-search.svg" size={17} />
            <span className="visually-hidden">Search</span>
            <input type="search" placeholder="Search places, records, regulations…" />
          </label>
          <p className="d-sync">{syncText}</p>
          <button type="button" className="d-icon-button" aria-label="Notifications">
            <Icon name="d1-bell.svg" size={20} />
          </button>
          <button type="button" className="d-season" aria-label={`Season ${new Date().getFullYear()}`}>
            {new Date().getFullYear()}
            <Icon name="d1-chevron-white.svg" size={14} />
          </button>
        </header>
        <main className="d-content">{children}</main>
      </div>
    </div>
  );
}

/** Page title + subtitle row with an optional action on the right. */
export function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="d-page-heading">
      <div>
        <h2 className="d-page-title">{title}</h2>
        <p className="d-page-subtitle">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
