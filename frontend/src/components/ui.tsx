import type { ButtonHTMLAttributes, ReactNode } from "react";
import { asset } from "../assets";
import type { AvatarTone } from "../data/constants";
import "./ui.css";

/** A Figma-exported icon. Size defaults to the file's own width/height. */
export function Icon({ name, size, className }: { name: string; size?: number; className?: string }) {
  return <img src={asset(name)} width={size} height={size} alt="" className={className} aria-hidden />;
}

export type BadgeTone = "ok" | "danger" | "warn";

const badgeIcon: Record<BadgeTone, string> = {
  ok: "m3-check-green.svg",
  danger: "m3-triangle-alert-red.svg",
  warn: "m3-radio-tower-amber.svg",
};

export function StatusBadge({ tone, icon, children }: { tone: BadgeTone; icon?: string; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <Icon name={icon ?? badgeIcon[tone]} size={12} />
      {children}
    </span>
  );
}

export function TagHolderBadge() {
  return (
    <StatusBadge tone="ok" icon="m4-tag-green.svg">
      Tag holder
    </StatusBadge>
  );
}

export function Avatar({ initials, tone, size = 34, fontSize }: { initials: string; tone: AvatarTone; size?: number; fontSize?: number }) {
  return (
    <span className={`avatar avatar-${tone}`} style={{ width: size, height: size, fontSize }}>
      {initials}
    </span>
  );
}

type ButtonVariant = "primary" | "dark" | "outline" | "soft";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: string;
  iconSize?: number;
  /** "lg" = 48 px mobile action, "md" = 44 px, "desk" = 42 px desktop button */
  size?: "lg" | "md" | "desk";
  block?: boolean;
}

export function Button({ variant = "primary", icon, iconSize, size = "lg", block, className = "", children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size}${block ? " btn-block" : ""} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={iconSize ?? (size === "desk" ? 17 : 19)} />}
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** "form" = harvest form style, "interval" = radio interval selector */
  variant?: "form" | "interval";
  className?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange, variant = "form", className = "" }: SegmentedProps<T>) {
  return (
    <div className={`segmented segmented-${variant} ${className}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className={option === value ? "segment segment-active" : "segment"}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Label + bordered control showing a value and a trailing icon (date, time, WMU, tag…). */
export function Field({ label, children, icon, className = "" }: { label: string; children: ReactNode; icon?: string; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      <span className="field-control">
        {children}
        {icon && <Icon name={icon} size={17} />}
      </span>
    </label>
  );
}

export function Divider() {
  return <hr className="divider" />;
}

/** The "Live tracking is on the mobile app" note used across the desktop screens. */
export function MobileNote({ icon, children, compact }: { icon: string; children: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? "mobile-note mobile-note-compact" : "mobile-note"}>
      <Icon name={icon} size={compact ? 18 : 20} />
      <p>{children}</p>
    </div>
  );
}
