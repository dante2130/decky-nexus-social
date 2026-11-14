import { InvitePeople } from "./invite-people";
import { addEventListener, removeEventListener, definePlugin, routerHook, toaster } from "@decky/api";
import { ConfirmModal, DialogButton, Focusable, Navigation, PanelSection, PanelSectionRow, ButtonItem, TextField, showModal, staticClasses } from "@decky/ui";
import React, { useEffect, useState, type ReactNode } from "react";
import { SocialHeader, tabs } from "./header";
import { installPartyBadge } from "./party-badge";
import { PartyMember } from "./party-roster";
import { ChatWindow, Conversation } from "./conversation";
import { FriendList, PlayerRows } from "./friends";
import * as xbox from "./rpc";
import { XboxVoice, type PartyMessage, type VoiceState } from "./voice";

function Action({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <PanelSectionRow><ButtonItem layout="below" onClick={onClick} disabled={disabled}>{children}</ButtonItem></PanelSectionRow>;
}

function PartyRowButton({ label, disabled, onClick, children }: {
  label: string; disabled: boolean; onClick: () => void; children: ReactNode;
}) {
  return <DialogButton aria-label={label} onOKActionDescription={label} disabled={disabled} onClick={onClick}
    style={{ width: 32, height: 32, minWidth: 0, padding: 0, display: "grid", placeItems: "center" }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>{label}</title>
      {children}
    </svg>
  </DialogButton>;
}

function confirm(label: string, callback: () => void) {
  showModal(<ConfirmModal strTitle={label} strOKButtonText="Confirm" onOK={callback} />);
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const initialVoice: VoiceState = { connected: false, muted: true, audioBlocked: false };

export default definePlugin(() => {
  // Quick Access can unmount its content while the party should keep running.
  let partyAccount = "";
  let selfXuid = "";
  let joiningParty = false;
  const partyRoute = "/nexus-social/party";
  const partyBadge = installPartyBadge(() => {
    Navigation.Navigate(partyRoute);
    Navigation.CloseSideMenus();
  });
  const profiles = new Map<string, xbox.Player>();
  const speaking = new Set<string>();
  let partyMessages: PartyMessage[] = [];
  const openPartyChats = new Map<symbol, string>();
  let rosterIds: Set<string> | undefined;
  const displayName = (id: string) => profiles.get(id)?.gamertag ?? `Xbox player (${id})`;
  const toast = (body: string) => { if (!disposed) toaster.toast({ title: "Xbox party", body }); };

  function updateRoster(state: xbox.Party) {
    if (disposed || !state.alive) return;
    partyBadge.update(state.members.length);
    const next = new Set(state.members.map(member => member.xuid));
    if (rosterIds) {
      for (const id of next) if (!rosterIds.has(id)) toast(`${displayName(id)} joined the party`);
      for (const id of rosterIds) if (!next.has(id)) {
        speaking.delete(id);
        toast(`${displayName(id)} left the party`);
      }
    }
    rosterIds = next;
    for (const id of next) {
      if (profiles.has(id)) continue;
      const placeholder = { xuid: id, gamertag: displayName(id) };
      profiles.set(id, placeholder);
      const account = partyAccount;
      void xbox.playerProfile(account, id).then(player => {
        if (partyAccount === account && profiles.get(id) === placeholder) {
          profiles.set(id, player);
          notify();
        }
      }).catch(() => {});
    }
  }
  let partyRequest: Promise<xbox.Party> | undefined;
  let cachedParty: xbox.Party | undefined;
  let cachedSnapshot: xbox.Snapshot | undefined;
  function readParty() {
    partyRequest ??= xbox.partyState().then(state => {
      cachedParty = state.id ? state : undefined;
      return state;
    }).finally(() => { partyRequest = undefined; });
    return partyRequest;
  }
  let checkingParty = false;
  let cachedRoster: Pick<xbox.Snapshot, "account" | "me" | "friends"> | undefined;
  let voiceState = initialVoice;
  let partyBusy = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const voice = new XboxVoice({
    startXboxParty: (offer, joinability, friend) => xbox.startParty(partyAccount, offer, joinability, friend),
    confirmXboxParty: async id => {
      const state = await readParty();
      if (state.id !== id || !state.alive) throw Error("Xbox party signaling disconnected.");
      updateRoster(state);
    },
    leaveXboxParty: xbox.leaveParty,
    xboxVoiceAllowed: xbox.voiceAllowed,
    xboxTextAllowed: xbox.textAllowed,
  }, state => {
    if (state.connected && !voiceState.connected) toast(joiningParty ? "Joined the party" : "Party created");
    if (!state.connected && voiceState.connected && state.error) toast("Disconnected from the party");
    voiceState = state;
    if (!state.connected) {
      partyBadge.update(0);
      rosterIds = undefined;
      partyMessages = [];
      speaking.clear();
    }
    notify();
  }, (id, active) => {
    if (speaking.has(id) === active) return;
    if (active) speaking.add(id);
    else speaking.delete(id);
    notify();
  }, message => {
    partyMessages = [...partyMessages.slice(-99), message];
    if (message.sender && !Array.from(openPartyChats.values()).includes(partyAccount)) {
      toast(`${displayName(message.sender)} sent a message`);
    }
    notify();
  });

  const signalingMonitor = setInterval(() => {
    if (!voiceState.connected || partyBusy || checkingParty) return;
    checkingParty = true;
    void readParty().then(state => {
      if (disposed) return;
      if (voiceState.connected && state.alive) updateRoster(state);
      if (voiceState.connected && !partyBusy && !state.alive) {
        return partyAction(() => voice.disconnect("Xbox party signaling disconnected."));
      }
    }).catch(() => {}).finally(() => { checkingParty = false; });
  }, 5000);

  async function partyAction(task: () => Promise<void>) {
    if (disposed || partyBusy) return;
    partyBusy = true;
    notify();
    try { await task(); }
    finally { partyBusy = false; notify(); }
  }

  let quickAccessTab: (typeof tabs)[number] = "Friends";

  function SocialPanel({ initialTab }: { initialTab?: (typeof tabs)[number] }) {
    const [tab, setSelectedTab] = useState(initialTab ?? quickAccessTab);
    function setTab(next: (typeof tabs)[number]) {
      if (!initialTab) quickAccessTab = next;
      setSelectedTab(next);
    }
    const [roster, setRoster] = useState(cachedRoster);
    const [snapshot, setSnapshot] = useState(() => initialTab === "Party" && voiceState.connected &&
      cachedSnapshot?.account === partyAccount ? cachedSnapshot : undefined);
    const [view, setView] = useState<"friends" | xbox.PeopleList>("friends");
    const [results, setResults] = useState<xbox.Player[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [query, setQuery] = useState("");
    const [party, setParty] = useState(() => voiceState.connected ? cachedParty : undefined);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [, redraw] = useState(0);

    async function run(task: () => Promise<void>) {
      setBusy(true);
      setError("");
      try { await task(); }
      catch (failure) { setError(errorText(failure)); }
      finally { setBusy(false); }
    }

    async function refresh() {
      const data = await xbox.load();
      if (roster && roster.account !== data.account) {
        setView("friends");
        setResults([]);
      }
      const { account, me, friends } = data;
      cachedSnapshot = data;
      cachedRoster = { account, me, friends };
      setRoster(cachedRoster);
      setSnapshot(data);
      if (!voiceState.connected || partyAccount === account) {
        for (const player of [me, ...friends]) profiles.set(player.xuid, player);
      }
    }

    useEffect(() => {
      const listener = () => {
        redraw(value => value + 1);
        if (cachedRoster) {
          const currentRoster = cachedRoster;
          setRoster(current => current?.account === currentRoster.account ? currentRoster : current);
          setSnapshot(current => current?.account === currentRoster.account ? { ...current, friends: currentRoster.friends } : current);
        }
      };
      listeners.add(listener);
      if (snapshot) {
        void refresh().catch(failure => {
          if (listeners.has(listener)) setError(errorText(failure));
        });
      } else {
        void run(refresh);
      }
      return () => { listeners.delete(listener); };
    }, []);

    useEffect(() => {
      if (tab !== "Party") return;
      let mounted = true;
      let pending = false;
      async function poll() {
        if (pending || partyBusy) return;
        pending = true;
        try {
          const state = await readParty();
          if (!mounted) return;
          setParty(state);
          if (voiceState.connected && state.alive) updateRoster(state);
        } catch (failure) {
          if (mounted) setError(errorText(failure));
        } finally { pending = false; }
      }
      void poll();
      const timer = setInterval(() => void poll(), 5000);
      return () => { mounted = false; clearInterval(timer); };
    }, [tab]);

    const account = snapshot?.account;
    useEffect(() => {
      if (tab !== "Messages" || !account || !snapshot) return;
      let active = true;
      const ids = [...new Set(snapshot.inbox.filter(thread => thread.type !== "System" && thread.participants.length === 1)
        .map(thread => thread.participants[0]))].filter(id => !profiles.has(id));
      const resolveProfiles = async () => {
        for (let offset = 0; offset < ids.length && active; offset += 4) {
          await Promise.all(ids.slice(offset, offset + 4).map(async id => {
            const player = await xbox.playerProfile(account, id).catch(() => undefined);
            if (player && active && cachedRoster?.account === account) profiles.set(id, player);
          }));
          if (active) notify();
        }
      };
      void resolveProfiles();
      return () => { active = false; };
    }, [tab, account, snapshot?.inbox]);

    const visibleParty = partyAccount === account ? party : undefined;
    const partyDisabled = busy || partyBusy;

    function openThread(player: xbox.Player) {
      if (!account) return;
      showModal(<Conversation player={player} account={account} onSent={lastMessage => {
        setSnapshot(current => {
          if (current?.account !== account) return current;
          const thread = current.inbox.find(item => item.participants.length === 1 && item.participants[0] === player.xuid);
          return { ...current, inbox: [{
            id: thread?.id ?? player.xuid, type: "OneToOne", participants: [player.xuid],
            unread: false, lastMessage,
          }, ...current.inbox.filter(item => item !== thread)] };
        });
      }} />);
    }

    async function loadPeople(list: xbox.PeopleList) {
      if (!account) return;
      const page = await xbox.listPeople(account, list, list === "search" ? query.trim() : "");
      setResults(page.items);
      setTruncated(page.truncated);
      setView(list);
    }

    function relationship(label: string, operation: xbox.PeopleAction, player: xbox.Player, ask = false) {
      const apply = () => void run(async () => {
        if (!account) return;
        await xbox.changePeople(account, operation, player.xuid);
        await refresh();
        if (view !== "friends") await loadPeople(view);
      });
      if (ask) confirm(`${label} ${player.gamertag}?`, apply);
      else apply();
    }

    function threadName(id: string) {
      return snapshot?.friends.find(friend => friend.xuid === id)?.gamertag ?? `Xbox player (${id})`;
    }

    async function startVoice(snapshot: xbox.Snapshot, joinability: xbox.Joinability, friend?: string) {
      if (partyAccount && partyAccount !== snapshot.account) profiles.clear();
      partyAccount = snapshot.account;
      selfXuid = snapshot.me.xuid;
      joiningParty = !!friend;
      for (const player of [snapshot.me, ...snapshot.friends]) profiles.set(player.xuid, player);
      await voice.start(joinability, friend);
    }

    function play(task: () => Promise<void>) {
      void run(() => partyAction(async () => {
        try { await task(); }
        finally {
          const state = await readParty().catch(() => undefined);
          if (state) setParty(state);
        }
      }));
    }

    const inboxRows = snapshot?.inbox.filter(thread => thread.type !== "System" && thread.participants.length === 1).map(thread => {
      const xuid = thread.participants[0];
      const player = profiles.get(xuid) ?? { xuid, gamertag: threadName(xuid) };
      const last = thread.lastMessage;
      const preview = !last ? "No messages" : last.hidden ? "Message unavailable" : `${last.mine ? "You: " : ""}${last.text}`;
      return { key: thread.id, player, preview, unread: thread.unread, activate: () => openThread(player) };
    }) ?? [];

    return <>
      <SocialHeader player={roster?.me} tab={tab} busy={busy} ready={!!snapshot} error={error}
        select={next => { setTab(next); if (next === "Friends") setView("friends"); }}
        refresh={() => void run(refresh)} />
      {!snapshot && roster && <FriendList friends={roster.friends} />}

      {snapshot && tab === "Friends" && view === "friends" &&
        <FriendList
          friends={snapshot.friends}
          actions={{
            busy,
            onMessage: openThread,
            onJoin: player => {
              if (partyBusy || voiceState.connected) {
                setError("Leave your current Xbox party before joining another.");
                return;
              }
              setTab("Party");
              play(() => startVoice(snapshot, "inviteOnly", player.xuid));
            },
            onFavorite: player => relationship("Favorite", player.favorite ? "unfavorite" : "favorite", player),
            onRemove: player => relationship("Remove", "remove-friend", player, true),
            onBlock: player => relationship("Block", "block", player, true),
          }}
        />}

      {snapshot && tab === "Friends" && <PanelSection title="Manage friends">
        <PanelSectionRow><TextField label="Gamertag" value={query} onChange={event => setQuery(event.currentTarget.value)} /></PanelSectionRow>
        <Action disabled={busy || !query.trim()} onClick={() => void run(() => loadPeople("search"))}>Search Xbox</Action>
        <Action disabled={busy || view === "friends"} onClick={() => setView("friends")}>Friend list</Action>
        <Action disabled={busy} onClick={() => void run(() => loadPeople("received-requests"))}>Incoming requests</Action>
        <Action disabled={busy} onClick={() => void run(() => loadPeople("sent-requests"))}>Sent requests</Action>
        <Action disabled={busy} onClick={() => void run(() => loadPeople("blocked"))}>Blocked players</Action>
        {view !== "friends" && truncated && <PanelSectionRow>Xbox returned a partial list.</PanelSectionRow>}
        {view !== "friends" && results.length === 0 && <PanelSectionRow>No players to show.</PanelSectionRow>}
        {view === "blocked" && results.length > 0 && <PlayerRows busy={busy} rows={results.map(player => ({
          key: player.xuid, player, preview: "Blocked · Select to unblock",
          activate: () => relationship("Unblock", "unblock", player, true),
        }))} />}
        {view !== "friends" && view !== "blocked" && results.map(player => {
          const friend = snapshot.friends.find(item => item.xuid === player.xuid);
          return <div key={player.xuid} style={{ marginBottom: 12 }}>
            <PanelSectionRow><strong>{player.gamertag}</strong><div>{player.presence}</div></PanelSectionRow>
            {view === "search" && player.xuid !== snapshot.me.xuid && <Action disabled={busy || !!friend} onClick={() => relationship("Send friend request to", "send-request", player)}>
              {friend ? "Already friends" : "Send friend request"}
            </Action>}
            {view === "received-requests" && <>
              <Action disabled={busy} onClick={() => relationship("Accept", "accept-request", player)}>Accept request</Action>
              <Action disabled={busy} onClick={() => relationship("Decline request from", "decline-request", player)}>Decline request</Action>
            </>}
            {view === "sent-requests" && <Action disabled={busy} onClick={() => relationship("Cancel request to", "cancel-request", player)}>Cancel request</Action>}
          </div>;
        })}
      </PanelSection>}

      {snapshot && tab === "Messages" && <PanelSection title="Direct messages">
        {inboxRows.length ? <PlayerRows rows={inboxRows} busy={busy} /> : <PanelSectionRow>No direct messages.</PanelSectionRow>}
      </PanelSection>}

      {snapshot && tab === "Party" && <PanelSection>
        <PanelSectionRow>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h2 style={{ fontSize: 14, margin: 0 }}>Party</h2>
            <Focusable flow-children="row" style={{ display: "flex", gap: 4 }}>
              {voiceState.connected && partyAccount === account && <PartyRowButton label="Add people"
                disabled={partyDisabled || !visibleParty?.id} onClick={() => {
                  const partyId = visibleParty?.id;
                  if (!partyId) return;
                  const members = new Set(visibleParty.members.map(member => member.xuid));
                  showModal(<InvitePeople
                    friends={snapshot.friends.filter(friend => !members.has(friend.xuid))}
                    invite={xuid => xbox.inviteFriend(xuid, partyId)}
                  />);
                }}>
                <circle cx="8" cy="7" r="3" />
                <path d="M2 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m4-13v8m-4-4h8" />
              </PartyRowButton>}
              {voiceState.connected && partyAccount === account && <PartyRowButton label="View party chat"
                disabled={partyDisabled} onClick={() => showModal(<PartyChat account={account} />)}>
                <path d="M21 5H3v12h4v4l5-4h9zM7 9h10m-10 4h7" />
              </PartyRowButton>}
              {(party?.id || voiceState.connected) && <PartyRowButton label="Leave party" disabled={partyDisabled} onClick={() => play(async () => {
              await voice.leave();
              cachedParty = undefined;
              toast("You left the party");
            })}>
              <path d="M10 4H4v16h6m-1-8h12m-4-4 4 4-4 4" />
            </PartyRowButton>}
            </Focusable>
          </div>
        </PanelSectionRow>
        {voiceState.error && <PanelSectionRow><div role="alert">{voiceState.error}</div></PanelSectionRow>}
        {!party?.id && !voiceState.connected && (["inviteOnly", "followedByMembers"] as const).map(joinability =>
          <Action key={joinability} disabled={partyDisabled} onClick={() => play(async () => {
            await startVoice(snapshot, joinability);
          })}>{joinability === "followedByMembers" ? "Create public party (joinable by friends)" : "Create invite-only party"}</Action>
        )}
        {(party?.id || voiceState.connected) && <PanelSectionRow>
          <PartyMember player={snapshot.me} speaking={voiceState.speaking === true} you
            status={voiceState.connected ? "Connected" : undefined}
            nameAction={voiceState.connected && partyAccount === account && <PartyRowButton
              label={voiceState.muted ? "Enable microphone" : "Mute microphone"}
              disabled={partyDisabled} onClick={() => play(() => voice.setMuted(!voiceState.muted))}>
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-3 0h6" />
              {voiceState.muted && <path d="m3 3 18 18" />}
            </PartyRowButton>} />
        </PanelSectionRow>}
        {voiceState.connected && partyAccount === account && <>
          {voiceState.audioBlocked && <Action disabled={partyDisabled} onClick={() => play(() => voice.resumeAudio())}>Enable party audio</Action>}
          {visibleParty?.members.filter(member => member.xuid !== selfXuid).map(member => {
            const name = displayName(member.xuid);
            const muted = voice.isPeerMuted(member.xuid);
            return <PanelSectionRow key={member.xuid}>
              <PartyMember player={profiles.get(member.xuid) ?? { xuid: member.xuid, gamertag: name }}
                speaking={speaking.has(member.xuid)} you={false}
                nameAction={<PartyRowButton label={`${muted ? "Unmute" : "Mute"} ${name}`}
                  disabled={partyDisabled} onClick={() => {
                    voice.mutePeer(member.xuid, !voice.isPeerMuted(member.xuid));
                    notify();
                  }}>
                  <path d="M3 9h4l5-4v14l-5-4H3z" />
                  {muted ? <>
                    <circle cx="18" cy="18" r="5" />
                    <path d="m16.5 16.5 3 3m0-3-3 3" />
                  </> : <path d="M15 9a4 4 0 0 1 0 6m2.5-8a7 7 0 0 1 0 10" />}
                </PartyRowButton>} />
            </PanelSectionRow>;
          })}
        </>}
      </PanelSection>}
    </>;
  }

  function PartyChat({ account, closeModal }: { account: string; closeModal?: () => void }) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [, redraw] = useState(0);
    useEffect(() => {
      const listener = () => redraw(value => value + 1);
      const dialog = Symbol();
      openPartyChats.set(dialog, account);
      listeners.add(listener);
      return () => {
        openPartyChats.delete(dialog);
        listeners.delete(listener);
      };
    }, [account]);
    const connected = voiceState.connected && partyAccount === account;
    const messages = connected ? partyMessages.map((message, index) => ({
      id: String(index), text: message.text, mine: message.sender === null,
      sender: message.sender ? displayName(message.sender) : undefined, hidden: false, timestamp: null,
    })) : [];
    return <ChatWindow title="Xbox party chat" closeModal={closeModal} messages={messages} draft={draft}
      setDraft={setDraft} error={error} empty={connected ? "No party messages yet." : "Party disconnected."}
      sendLabel="Send to party" sendDisabled={!connected} onSend={() => {
        try {
          voice.sendText(draft);
          setDraft("");
          setError("");
        } catch (failure) {
          setError(errorText(failure));
        }
      }} />;
  }

  const friendsUpdated = addEventListener<[string, xbox.Player[]]>("friends_updated", (account, friends) => {
    if (cachedRoster?.account !== account) return;
    cachedRoster = { ...cachedRoster, friends };
    if (cachedSnapshot?.account === account) cachedSnapshot = { ...cachedSnapshot, friends };
    if (!voiceState.connected || partyAccount === account) {
      for (const player of friends) profiles.set(player.xuid, player);
    }
    notify();
  });

  routerHook.addRoute(partyRoute, () =>
    <Focusable flow-children="column" style={{
      position: "absolute", inset: "56px 0 48px", overflowY: "auto",
      boxSizing: "border-box", padding: "12px 24px 24px", scrollPadding: "12px 0 24px",
    }} onFocus={event => {
      if (event.target instanceof HTMLElement && event.target !== event.currentTarget) {
        event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }}>
      <SocialPanel initialTab="Party" />
    </Focusable>, { exact: true });

  return {
    name: "Nexus Social",
    titleView: <div className={staticClasses.Title}>Nexus Social</div>,
    content: <SocialPanel />,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <circle cx="8" cy="7" r="3.5" />
      <circle cx="17" cy="8" r="3" />
      <path d="M1 20v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3H1Zm16 0v-3a7 7 0 0 0-1.4-4.2H18a5 5 0 0 1 5 5V20h-6Z" />
    </svg>,
    onDismount() {
      disposed = true;
      clearInterval(signalingMonitor);
      partyBadge.remove();
      routerHook.removeRoute(partyRoute);
      removeEventListener("friends_updated", friendsUpdated);
      openPartyChats.clear();
      listeners.clear();
      void voice.leave().catch(() => {});
    },
  };
});
