import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { Icon } from "../components/ui";
import "./mobile.css";

const tabs = [
  { to: "/map", label: "Map", icon: "m3-nav-map.svg", activeIcon: "m1-nav-map.svg" },
  { to: "/party", label: "Party", icon: "m1-nav-radio.svg", activeIcon: "m3-nav-radio.svg" },
  { to: "/log", label: "Log", icon: "m1-nav-notebook.svg", activeIcon: "m5-nav-notebook.svg" },
  { to: "/assistant", label: "Assistant", icon: "m1-nav-messages.svg", activeIcon: "m6-nav-messages.svg" },
  { to: "/more", label: "More", icon: "m1-nav-menu.svg", activeIcon: "m1-nav-menu.svg" },
];

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="m-app">
      <div className="m-safe-top" />
      <main className="m-main">{children}</main>
      <nav className="m-nav" aria-label="Main">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? "m-tab m-tab-active" : "m-tab")}>
            {({ isActive }) => (
              <>
                <span className="m-tab-indicator">
                  <Icon name={isActive ? tab.activeIcon : tab.icon} size={22} />
                </span>
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

interface HeaderAction {
  icon: string;
  label: string;
  to?: string;
  onClick?: () => void;
}

/** Dark green screen header: small uppercase kicker + large title + one icon action. */
export function MobileHeader({ kicker, title, action }: { kicker: string; title: string; action?: HeaderAction }) {
  return (
    <header className="m-header">
      <div className="m-header-text">
        <p className="m-header-kicker">{kicker}</p>
        <h1 className="m-header-title">{title}</h1>
      </div>
      {action &&
        (action.to ? (
          <Link to={action.to} className="m-header-action" aria-label={action.label}>
            <Icon name={action.icon} size={22} />
          </Link>
        ) : (
          <button type="button" className="m-header-action" aria-label={action.label} onClick={action.onClick}>
            <Icon name={action.icon} size={22} />
          </button>
        ))}
    </header>
  );
}
