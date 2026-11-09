import { NavLink } from "react-router";

const tabs = [
  { to: "/map", label: "Map" },
  { to: "/party", label: "Party" },
  { to: "/log", label: "Log" },
  { to: "/assistant", label: "Assistant" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => (isActive ? "tab tab-active" : "tab")}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
