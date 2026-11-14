import React, { useEffect, useRef, useState } from "react";
import { DialogButton, Focusable, TextField } from "@decky/ui";
import { WideModal } from "./wide-modal";
import * as xbox from "./rpc";

export function Conversation({ player, account, closeModal, onSent }: {
  player: xbox.Player;
  account: string;
  closeModal?: () => void;
  onSent(message: xbox.Message): void;
}) {
  const [messages, setMessages] = useState<xbox.Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = useRef(true);

  async function refresh() {
    const items = await xbox.conversation(account, player.xuid);
    if (active.current) setMessages(items);
    return items;
  }

  async function run(task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await task(); }
    catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  useEffect(() => {
    active.current = true;
    void run(async () => { await refresh(); });
    return () => { active.current = false; };
  }, []);

  return <ChatWindow title={player.gamertag} closeModal={closeModal} messages={messages} draft={draft}
    setDraft={setDraft} busy={busy} error={error}
    onRefresh={() => void run(async () => { await refresh(); })}
    onSend={() => void run(async () => {
      await xbox.sendMessage(account, player.xuid, draft);
      if (active.current) setDraft("");
      const timestamp = new Date().toISOString();
      const sent = { id: `sent-${timestamp}`, mine: true, text: draft, hidden: false, timestamp };
      onSent(sent);
      if (active.current) setMessages(current => [...current, sent]);
    })} />;
}

export function ChatWindow({ title, closeModal, messages, draft, setDraft, busy, error, empty = "No messages to show.", onRefresh, onSend, sendDisabled, sendLabel = "Send message" }: {
  title: string;
  closeModal?: () => void;
  messages: readonly (xbox.Message & { sender?: string })[];
  draft: string;
  setDraft(value: string): void;
  busy?: boolean;
  error?: string;
  empty?: string;
  onRefresh?: () => void;
  onSend(): void;
  sendDisabled?: boolean;
  sendLabel?: string;
}) {
  const history = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [messages]);

  return <WideModal closeModal={closeModal}>
    <Focusable flow-children="column" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", height: "min(510px, 70vh)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {onRefresh && <ChatIcon label="Refresh conversation" disabled={busy} onClick={onRefresh}>
          <path d="M20 9a8 8 0 0 0-14-3L3 9m0-5v5h5m-4 6a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
        </ChatIcon>}
      </div>
      <div ref={history} role="log" aria-label="Conversation" tabIndex={0}
        style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: 6 }}>
        {!messages.length && <p>{busy ? "Loading conversation…" : empty}</p>}
        {messages.map(message => <div key={message.id} style={{
          display: "flex", flexDirection: "column", alignItems: message.mine ? "flex-end" : "flex-start", marginBottom: 8,
        }}>
          {!message.mine && message.sender && <small style={{ color: "#c3cad1" }}>{message.sender}</small>}
          <div aria-label={message.mine ? "You" : message.sender ?? title} style={{
            maxWidth: "85%", padding: "7px 11px", color: "#fff",
            background: message.mine ? "#286c36" : "#353b42",
            borderRadius: message.mine ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
            overflowWrap: "anywhere", whiteSpace: "pre-wrap",
          }}>{message.hidden ? "Message unavailable" : message.text}</div>
          {message.timestamp && <small style={{ color: "#c3cad1" }}>{new Date(message.timestamp).toLocaleString()}</small>}
        </div>)}
      </div>
      {error && <div role="alert">{error}</div>}
      <TextField label="Message" value={draft} inlineControls={
        <ChatIcon label={sendLabel} disabled={busy || sendDisabled || !draft.trim()} onClick={onSend} inline>
          <path d="m3 4 18 8-18 8 3-8-3-8Zm3 8h15" />
        </ChatIcon>
      }
        onChange={event => setDraft([...event.currentTarget.value].slice(0, 256).join(""))} />
    </Focusable>
  </WideModal>;
}

function ChatIcon({ label, disabled, onClick, inline, children }: {
  label: string; disabled?: boolean; onClick(): void; inline?: boolean; children: React.ReactNode;
}) {
  return <DialogButton aria-label={label} onOKActionDescription={label} disabled={disabled} onClick={onClick}
    style={{ width: 32, minWidth: 32, height: 32, padding: 0, marginInline: inline ? 4 : undefined,
      display: "grid", placeItems: "center" }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>{label}</title>
      {children}
    </svg>
  </DialogButton>;
}
