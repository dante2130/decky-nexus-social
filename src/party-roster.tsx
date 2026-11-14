import React, { type ReactNode } from "react";
import { Focusable } from "@decky/ui";
import type { Player } from "./rpc";

export function PartyMember({ player, speaking, you, status, nameAction, children }: { player: Player; speaking: boolean; you: boolean; status?: string; nameAction?: ReactNode; children?: ReactNode }) {
  return <div style={{ padding: "6px 4px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span aria-hidden="true" style={{
        position: "relative", display: "grid", placeItems: "center", flex: "0 0 36px",
        height: 36, borderRadius: "50%", background: "#414846",
        boxShadow: speaking ? "0 0 0 2px #78cf45" : "none",
      }}>
        {Array.from(player.gamertag)[0]?.toUpperCase()}
        {player.avatarUrl && <img src={player.avatarUrl} alt="" referrerPolicy="no-referrer"
          onError={event => { event.currentTarget.style.visibility = "hidden"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#f8f9fa" }}>
            {player.gamertag}{you ? " (You)" : ""}
          </strong>
          {nameAction}
        </Focusable>
        {status && <div style={{ color: "#c3cad1", fontSize: 12 }}>{status}</div>}
        {!status && <div aria-hidden={!speaking} style={{
          color: "#9ae36d", fontSize: 11, lineHeight: "14px", visibility: speaking ? "visible" : "hidden",
        }}>Speaking</div>}
      </div>
    </div>
    {children && <Focusable flow-children="row" style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
      {children}
    </Focusable>}
  </div>;
}
