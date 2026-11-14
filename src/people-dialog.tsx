import React, { useEffect, useRef, useState } from "react";
import { ConfirmModal, DialogButton, Focusable, MenuItem, TextField, showModal } from "@decky/ui";
import { PlayerRows } from "./friends";
import { t, translateError, useLanguage, type MessageKey } from "./i18n";
import * as xbox from "./rpc";
import { WideModal } from "./wide-modal";

const requestLists = [
  ["received-requests", "Incoming requests"],
  ["sent-requests", "Sent requests"],
  ["blocked", "Blocked players"],
] as const satisfies readonly [xbox.PeopleList, MessageKey][];

export function PeopleDialog({ mode, snapshot, refresh, closeModal }: {
  mode: "search" | "manage";
  snapshot: xbox.Snapshot;
  refresh(): Promise<xbox.Snapshot>;
  closeModal?: () => void;
}) {
  useLanguage();
  const [friends, setFriends] = useState(snapshot.friends);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<xbox.PeopleList>(mode === "search" ? "search" : "received-requests");
  const [page, setPage] = useState<Awaited<ReturnType<typeof xbox.listPeople>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const submittedQuery = useRef("");

  async function run(task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function load(next: xbox.PeopleList, search = "") {
    setList(next);
    setPage(undefined);
    setPage(await xbox.listPeople(snapshot.account, next, search));
  }

  useEffect(() => {
    if (mode === "manage") void run(() => load("received-requests"));
  }, [mode]);

  function change(operation: xbox.PeopleAction, player: xbox.Player) {
    void run(async () => {
      await xbox.changePeople(snapshot.account, operation, player.xuid);
      const updated = await refresh();
      setFriends(updated.friends);
      await load(list, submittedQuery.current);
    });
  }

  function unblock(player: xbox.Player) {
    showModal(<ConfirmModal strTitle={t("Unblock {name}?", { name: player.gamertag })}
      strOKButtonText={t("Confirm")} strCancelButtonText={t("Cancel")} onOK={() => change("unblock", player)} />);
  }

  const rows = page?.items.map(player => {
    const row = { key: player.xuid, player };
    switch (list) {
      case "blocked":
        return { ...row, preview: t("Blocked · Select to unblock"), activate: () => unblock(player) };
      case "received-requests":
        return { ...row, menu: <>
          <MenuItem onSelected={() => change("accept-request", player)}>{t("Accept request")}</MenuItem>
          <MenuItem onSelected={() => change("decline-request", player)}>{t("Decline request")}</MenuItem>
        </> };
      case "sent-requests":
        return { ...row, menu: <MenuItem onSelected={() => change("cancel-request", player)}>{t("Cancel request")}</MenuItem> };
      case "search":
        if (player.xuid === snapshot.me.xuid) return row;
        if (friends.some(friend => friend.xuid === player.xuid)) return { ...row, preview: t("Already friends") };
        return { ...row, menu: <MenuItem onSelected={() => change("send-request", player)}>{t("Send friend request")}</MenuItem> };
    }
  }) ?? [];

  return <WideModal closeModal={closeModal} bDisableBackgroundDismiss={busy} bCancelDisabled={busy}>
    <Focusable flow-children="column" style={{ width: "100%", minWidth: 0, maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0 }}>{t(mode === "search" ? "Search Xbox" : "Manage friends")}</h2>
      {mode === "search" ? <>
        <TextField label={t("Gamertag")} value={query} disabled={busy} onChange={event => setQuery(event.currentTarget.value)} />
        <DialogButton disabled={busy || !query.trim()} onClick={() => void run(() => {
          submittedQuery.current = query.trim();
          return load("search", submittedQuery.current);
        })}>{t("Search Xbox")}</DialogButton>
      </> : <Focusable flow-children="row" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {requestLists.map(([id, label]) => <DialogButton key={id} disabled={busy} aria-pressed={list === id}
          onClick={() => void run(() => load(id))}>{t(label)}</DialogButton>)}
      </Focusable>}
      {busy && <div role="status">{t("Working…")}</div>}
      {error && <div role="alert">{translateError(error)}</div>}
      <div style={{ minHeight: 0, overflowY: "auto" }} onFocus={event => {
        if (event.target !== event.currentTarget) event.target.scrollIntoView({ block: "nearest" });
      }}>
        {page?.truncated && <div>{t("Xbox returned a partial list.")}</div>}
        {page?.items.length === 0 && <div>{t("No players to show.")}</div>}
        {rows.length > 0 && <PlayerRows busy={busy} rows={rows} />}
      </div>
    </Focusable>
  </WideModal>;
}
