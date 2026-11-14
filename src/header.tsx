import { t, translateError } from "./i18n";
import React, { useState } from "react";
import { DialogButton, Focusable } from "@decky/ui";
import { presenceOf } from "./friends";
import type { Player } from "./rpc";

export const tabs = ["Friends", "Messages", "Party"] as const;
type Tab = (typeof tabs)[number];
type Control = Tab | "Manage friends" | "Search Xbox" | "Refresh";

const icons: Record<Control, React.ReactNode> = {
  Friends: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M17 5a3 3 0 0 1 0 6m4 9v-2a4 4 0 0 0-3-3.9" /></>,
  Messages: <path d="M21 5H3v12h4v4l5-4h9zM7 9h10m-10 4h7" />,
  Party: <><path d="M3 14v-2a9 9 0 0 1 18 0v2m-1 5c-1 2-3 2-6 2" /><rect x="3" y="12" width="4" height="7" rx="2" /><rect x="17" y="12" width="4" height="7" rx="2" /></>,
  "Manage friends": <><circle cx="8" cy="7" r="3" /><path d="M2 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m3-12h5m-5 5h5m-5 5h5" /></>,
  "Search Xbox": <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  Refresh: <path d="M20 9a8 8 0 0 0-14-3L3 9m0-5v5h5m-4 6a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />,
};

const styles = `
  .nexus-social-header { margin: 0 12px 8px; padding: 12px; background: #23272a; border-radius: 8px; }
  .nexus-social-profile { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .nexus-social-profile-avatar { flex: 0 0 42px; height: 42px; display: grid; place-items: center; position: relative; border-radius: 50%; background: #414846; font-weight: 700; }
  .nexus-social-profile-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
  .nexus-social-profile-copy { min-width: 0; }
  .nexus-social-profile-copy strong { color: #f8f9fa; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nexus-social-profile-meta { display: flex; gap: 6px 10px; flex-wrap: wrap; font-size: 12px; color: #c3cad1; margin-top: 2px; }
  .nexus-social-profile-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
  .nexus-social-gamerscore { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
  .nexus-social-nav { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
  .nexus-social-nav .nexus-social-action-start { margin-inline-start: auto; }
  .nexus-social-nav .nexus-social-control { width: 32px !important; min-width: 0 !important; height: 32px; min-height: 0; padding: 0 !important; flex: 0 0 32px; display: grid; place-items: center; border-radius: 4px; }
  .nexus-social-nav .nexus-social-control.nexus-social-active {
    background: #fff !important;
    color: #0e141b !important;
    box-shadow: none !important;
  }
  .nexus-social-nav .nexus-social-active svg { color: #0e141b !important; }
  .nexus-social-nav .nexus-social-active:is(.gpfocus, :focus-visible) {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .nexus-social-header-alert, .nexus-social-header-status { margin: 8px 0 0; font-size: 12px; overflow-wrap: anywhere; }
  .nexus-social-header-alert { color: #e2c4a2; }
  .nexus-social-header-status { color: #c3cad1; }
`;

export function SocialHeader({ player, tab, busy, ready, error, select, manage, search, refresh }: {
  player?: Player;
  tab: Tab;
  busy: boolean;
  ready: boolean;
  error: string;
  select(tab: Tab): void;
  manage?: () => void;
  search?: () => void;
  refresh(): void;
}) {
  const [failedAvatar, setFailedAvatar] = useState<string>();
  const status = player ? presenceOf(player) : undefined;
  const statusColor = status === "Online" ? "#78cf45" : status === "Away" ? "#ffc95f" : "#a0a8b1";
  function controlButton(control: Control, onClick: () => void, active?: boolean, actionStart?: boolean) {
    const label = t(control === "Refresh" && !ready ? "Connect with Nexus sign-in" : control);
    return <DialogButton key={control} className={`nexus-social-control${active ? " nexus-social-active" : ""}${actionStart ? " nexus-social-action-start" : ""}`}
      onOKActionDescription={label} aria-label={label} aria-pressed={active}
      disabled={busy} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>{label}</title>
        {icons[control]}
      </svg>
    </DialogButton>;
  }

  return <header className="nexus-social-header">
    <style>{styles}</style>
    {player && <div className="nexus-social-profile">
        <div className="nexus-social-profile-avatar" aria-hidden="true">
          {Array.from(player.gamertag)[0]?.toUpperCase()}
          {player.avatarUrl && player.avatarUrl !== failedAvatar &&
            <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatar(player.avatarUrl ?? undefined)} />}
        </div>
        <div className="nexus-social-profile-copy">
          <strong>{player.gamertag}</strong>
          <div className="nexus-social-profile-meta">
            <span><span className="nexus-social-profile-dot" style={{ background: statusColor }} />{status && t(status)}</span>
            {player.gamerscore != null && <span className="nexus-social-gamerscore" aria-label={t("Gamerscore {score}", { score: player.gamerscore })}>
              <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="#fff" />
                <path d="M16 8.5a5 5 0 1 0 .5 6.5V12H12" fill="none" stroke="#182726" strokeWidth="2.2" />
              </svg>
              {player.gamerscore}
            </span>}
          </div>
        </div>
    </div>}
    <Focusable className="nexus-social-nav" flow-children="row">
      {ready && tabs.map(control => controlButton(control, () => select(control), tab === control))}
      {manage && controlButton("Manage friends", manage, undefined, true)}
      {search && controlButton("Search Xbox", search, undefined, !manage)}
      {controlButton("Refresh", refresh, undefined, !manage && !search)}
    </Focusable>
    {error && <div className="nexus-social-header-alert" role="alert">{translateError(error)}</div>}
    {busy && <div className="nexus-social-header-status" role="status">{t("Working…")}</div>}
  </header>;
}
