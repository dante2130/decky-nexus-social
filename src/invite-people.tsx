import React, { useRef, useState } from "react";
import { DialogButton, Focusable, TextField } from "@decky/ui";
import { WideModal } from "./wide-modal";
import { FriendList } from "./friends";
import type { Player } from "./rpc";

export function InvitePeople({ friends, invite, closeModal }: {
  friends: Player[];
  invite(xuid: string): Promise<void>;
  closeModal?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set<string>());
  const [sent, setSent] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const sending = useRef(false);
  const remaining = friends.filter(friend => !sent.has(friend.xuid));
  const visible = remaining.filter(friend => friend.gamertag.toLowerCase().includes(query.trim().toLowerCase()));

  async function sendInvites() {
    if (sending.current || !selected.size) return;
    sending.current = true;
    setBusy(true);
    setFeedback("");
    const succeeded = new Set<string>();
    const failures: string[] = [];
    try {
      for (const friend of remaining.filter(player => selected.has(player.xuid))) {
        try {
          await invite(friend.xuid);
          succeeded.add(friend.xuid);
        } catch {
          failures.push(friend.gamertag);
        }
      }
      setSent(previous => new Set([...previous, ...succeeded]));
      setSelected(previous => new Set([...previous].filter(id => !succeeded.has(id))));
      setFeedback([
        succeeded.size ? `Invites sent: ${succeeded.size}.` : "",
        failures.length ? `Could not invite ${failures.join(", ")}. Check the party and retry.` : "",
      ].filter(Boolean).join(" "));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <WideModal closeModal={closeModal} bDisableBackgroundDismiss={busy} bCancelDisabled={busy}>
    <Focusable flow-children="column" style={{ width: "100%", minWidth: 0, boxSizing: "border-box", maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Add people</h2>
      <TextField label="Search friends" value={query} disabled={busy}
        onChange={event => setQuery(event.currentTarget.value)} />
      <div style={{ minHeight: 0, flex: "1 1 auto", overflowY: "auto" }} onFocus={event => {
        if (event.target !== event.currentTarget) event.target.scrollIntoView({ block: "nearest" });
      }}>
        {visible.length > 0 ? <FriendList friends={visible} selection={{
          selected, busy,
          toggle: id => setSelected(previous => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          }),
        }} /> : <p>{remaining.length ? "No matching friends." : "No friends left to invite."}</p>}
      </div>
      {feedback && <div role="status" style={{ maxHeight: "10vh", overflowY: "auto" }}>{feedback}</div>}
      <DialogButton disabled={busy || !selected.size} onClick={() => void sendInvites()}>
        {busy ? "Sending invites…" : `Invite to party${selected.size ? ` (${selected.size})` : ""}`}
      </DialogButton>
    </Focusable>
  </WideModal>;
}
