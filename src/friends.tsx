import { t, type MessageKey } from "./i18n";
import React, { useState } from "react";
import { DialogButton, DialogCheckbox, Menu, MenuItem, showContextMenu } from "@decky/ui";
import type { Player } from "./rpc";

type Presence = "Online" | "Away" | "Offline" | "Status unavailable";

export function presenceOf(player: Player): Presence {
  const detail = player.presence?.trim().toLowerCase();
  if (player.online) return detail === "away" ? "Away" : "Online";
  if (player.online === false && detail && detail !== "presence unavailable") return "Offline";
  return "Status unavailable";
}

export function groupFriends(friends: Player[]) {
  const online: Player[] = [];
  const offline: Player[] = [];
  const unavailable: Player[] = [];
  for (const player of friends) {
    const status = presenceOf(player);
    if (status === "Online" || status === "Away") online.push(player);
    else if (status === "Offline") offline.push(player);
    else unavailable.push(player);
  }
  for (const group of [online, offline, unavailable]) {
    group.sort((left, right) =>
      Number(!!right.favorite) - Number(!!left.favorite) ||
      left.gamertag.localeCompare(right.gamertag, undefined, { sensitivity: "base" }));
  }
  return { online, offline, unavailable };
}

const tone: Record<Presence, string> = {
  Online: "#78cf45",
  Away: "#ffc95f",
  Offline: "#a0a8b1",
  "Status unavailable": "#a0a8b1",
};

const styles = `
  .nexus-friends-list { margin: 0 6px 12px; }
  .nexus-friends-list h2 { margin: 0; font-size: 16px; font-weight: 650; }
  .nexus-friends-group { margin: 16px 0 8px; }
  .nexus-friends-group h3 { margin: 0 0 6px; font-size: 14px; font-weight: 650; }
  .nexus-friends-group h3 span { margin-left: 6px; color: #b8c0ca; font-weight: 400; }
  .nexus-friend-entry + .nexus-friend-entry {
    margin-top: 6px;
  }
  .nexus-friends-group .nexus-friend-row {
    width: 100%; min-width: 0; box-sizing: border-box; padding: 6px !important; min-height: 48px;
    background: #25282c; border-radius: 4px; text-align: left; color: #f8f9fa;
  }
  .nexus-friends-group .nexus-friend-row:not(.nexus-friend-checkbox):focus,
  .nexus-friends-group .nexus-friend-row:not(.nexus-friend-checkbox):focus-visible,
  .nexus-friends-group .nexus-friend-row:not(.nexus-friend-checkbox).gpfocus {
    background: #353d36; outline: 2px solid #78cf45; outline-offset: -2px;
  }
  .nexus-friend-checkbox .nexus-friend-copy {
    display: flex; flex-direction: column; align-items: stretch; gap: 2px;
  }
  .nexus-friend-checkbox .nexus-friend-content { width: 100%; min-width: 0; }
  .nexus-friends-group .nexus-friend-checkbox:is(:focus, :focus-visible, :focus-within, .gpfocus, .gpfocuswithin) {
    background: #fff !important; color: #0e141b !important; box-shadow: none !important;
  }
  .nexus-friend-checkbox:is(:focus, :focus-visible, :focus-within, .gpfocus, .gpfocuswithin)
    .nexus-friend-device { color: #39434e; }
  .nexus-friend-content { display: flex; align-items: center; gap: 7px; }
  .nexus-friend-avatar {
    flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: grid;
    place-items: center; background: #414846; color: #fff; font-size: 16px;
    font-weight: 700; position: relative;
  }
  .nexus-friend-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
  .nexus-friend-dot { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border: 2px solid #25282c; border-radius: 50%; box-sizing: border-box; }
  .nexus-friend-copy { flex: 1; min-width: 0; line-height: 1.4; }
  .nexus-friend-name, .nexus-friend-status { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nexus-friend-name { font-size: 14px; font-weight: 650; }
  .nexus-friend-status { font-size: 12px; color: #c3cad1; }
  .nexus-friend-row:is(:focus, :focus-visible, .gpfocus) .nexus-friend-status,
  .nexus-friend-checkbox:is(:focus-within, .gpfocuswithin) .nexus-friend-status { color: inherit; }
  .nexus-friend-star { margin-left: 5px; color: #f1cf68; }
  .nexus-friend-device { flex: 0 0 16px; color: #c3cad1; }
  .nexus-friend-more { color: #c3cad1; letter-spacing: 1px; align-self: center; }
`;

interface FriendListProps {
  friends: Player[];
  busy: boolean;
  onJoin(player: Player): void;
  onMessage(player: Player): void;
  onFavorite(player: Player): void;
  onRemove(player: Player): void;
  onBlock(player: Player): void;
}

interface FriendSelection {
  selected: ReadonlySet<string>;
  busy: boolean;
  toggle(xuid: string): void;
}

type FriendActions = Omit<FriendListProps, "friends">;

function FriendRow({ player, actions, selection, preview, unread, activate, menu, disabled, hidePlatform }: {
  player: Player; actions?: FriendActions; selection?: FriendSelection; preview?: string;
  unread?: boolean; activate?: () => void; menu?: React.ReactNode; disabled?: boolean; hidePlatform?: boolean;
}) {
  const [failedAvatar, setFailedAvatar] = useState<string>();
  const status = presenceOf(player);
  const detail = player.presence?.trim();
  const activity = detail && !["online", "away", "offline", "presence unavailable"].includes(detail.toLowerCase()) ? detail : undefined;
  const subtitle = [t(status), activity, player.inParty && player.online ? t("In a party") : undefined].filter(Boolean).join(" · ");
  const content = <>
    <span className="nexus-friend-content">
      <span className="nexus-friend-avatar" aria-hidden="true">
        {Array.from(player.gamertag)[0]?.toUpperCase()}
        {player.avatarUrl && player.avatarUrl !== failedAvatar &&
          <img src={player.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedAvatar(player.avatarUrl ?? undefined)} />}
        <span className="nexus-friend-dot" style={{ background: tone[status] }} />
      </span>
      <span className="nexus-friend-copy">
        <span className="nexus-friend-name">{player.gamertag}{player.favorite && <span className="nexus-friend-star" aria-label={t("Favorite")}>★</span>}</span>
        <span className="nexus-friend-status" title={preview ?? subtitle}>{preview ?? subtitle}</span>
      </span>
      {!hidePlatform && player.online && (player.device === "pc" || player.device === "xbox") &&
        <svg className="nexus-friend-device" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          role="img" aria-label={player.device === "pc" ? "PC" : t("Xbox console")}>
          <title>{player.device === "pc" ? "PC" : t("Xbox console")}</title>
          {player.device === "pc" ? <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M12 16v4m-4 0h8" />
          </> : <>
            <circle cx="12" cy="12" r="9" />
            <path d="M6 18c2-5 7-10 12-12M18 18C16 13 11 8 6 6" />
          </>}
        </svg>}
      {(player.joinablePartyId || player.inParty) && <svg width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke={player.joinablePartyId ? "#9ae36d" : "currentColor"} strokeWidth="1.8" role="img"
        aria-label={player.joinablePartyId ? t("Joinable Xbox party") : t("In an Xbox party")}>
        <title>{player.joinablePartyId ? t("Joinable Xbox party") : t("In an Xbox party")}</title>
        <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
        <rect x="3" y="12" width="4" height="7" rx="2" /><rect x="17" y="12" width="4" height="7" rx="2" />
      </svg>}
      {unread && <span aria-label={t("Unread")} title={t("Unread")} style={{ color: "#9ae36d", flexShrink: 0 }}>●</span>}
      {(actions || menu) && <span className="nexus-friend-more" aria-hidden="true">···</span>}
    </span>
  </>;
  if (selection) return <DialogCheckbox className="nexus-friend-row nexus-friend-checkbox"
    label={content} bottomSeparator="none" controlled checked={selection.selected.has(player.xuid)}
    disabled={selection.busy} onChange={() => selection.toggle(player.xuid)} />;
  if (activate) return <DialogButton className="nexus-friend-row" disabled={disabled} onClick={activate}>{content}</DialogButton>;
  if (menu) return <DialogButton className="nexus-friend-row" disabled={disabled} onClick={event =>
    showContextMenu(<Menu label={player.gamertag}>{menu}</Menu>, event.currentTarget ?? undefined)
  }>{content}</DialogButton>;
  if (!actions) return <div className="nexus-friend-row">{content}</div>;
  const { busy, onJoin, onMessage, onFavorite, onRemove, onBlock } = actions;
  return <DialogButton className="nexus-friend-row" disabled={busy} onClick={event =>
    showContextMenu(<Menu label={player.gamertag}>
      {player.joinablePartyId && <MenuItem onSelected={() => onJoin(player)}>{t("Join party")}</MenuItem>}
      <MenuItem onSelected={() => onMessage(player)}>{t("Message")}</MenuItem>
      <MenuItem onSelected={() => onFavorite(player)}>{player.favorite ? t("Remove from favorites") : t("Add to favorites")}</MenuItem>
      <MenuItem onSelected={() => onRemove(player)}>{t("Remove friend")}</MenuItem>
      <MenuItem onSelected={() => onBlock(player)}>{t("Block player")}</MenuItem>
    </Menu>, event.currentTarget ?? undefined)
  }>
    {content}
  </DialogButton>;
}

export function FriendList({ friends, actions, selection }: { friends: Player[]; actions?: FriendActions; selection?: FriendSelection }) {
  const { online, offline, unavailable } = groupFriends(friends);
  const groups: { title: MessageKey; players: Player[] }[] = [
    { title: "Online", players: online },
    { title: "Offline", players: offline },
    { title: "Status unavailable", players: unavailable },
  ];
  return <section className="nexus-friends-list">
    <style>{styles}</style>
    {!selection && <h2>{t("Friends")}</h2>}
    {groups.map(({ title, players }) => (players.length > 0 || title === "Online") &&
      <section className="nexus-friends-group" key={title} aria-label={t(title)}>
        <h3>{t(title)} <span>{players.length}</span></h3>
        {players.length === 0 && <div>{t("No friends online.")}</div>}
        {players.map(player => <div className="nexus-friend-entry" key={player.xuid}><FriendRow player={player} actions={actions} selection={selection} /></div>)}
      </section>
    )}
  </section>;
}

export function PlayerRows({ rows, busy, hidePlatform }: { rows: {
  key: string; player: Player; preview?: string; unread?: boolean; activate?(): void; menu?: React.ReactNode;
}[]; busy: boolean; hidePlatform?: boolean }) {
  return <div className="nexus-friends-list">
    <style>{styles}</style>
    <div className="nexus-friends-group">
      {rows.map(({ key, ...row }) => <div className="nexus-friend-entry" key={key}>
        <FriendRow {...row} disabled={busy} hidePlatform={hidePlatform} />
      </div>)}
    </div>
  </div>;
}
