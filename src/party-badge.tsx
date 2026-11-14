import { t, useLanguage } from "./i18n";
import { routerHook } from "@decky/api";
import { afterPatch, findClassModule, findModule, Focusable } from "@decky/ui";
import React, { cloneElement, createElement, useEffect, useState, useSyncExternalStore, type ElementType, type ReactNode } from "react";

const headerClasses = findClassModule(value => value.HeaderItem && value.Clickable && value.Clock) as
  { HeaderItem: string; Clickable: string } | undefined;
const badgeKey = "nexus-party-badge";

function PartyBadge({ count, onOpen, native }: { count: number; onOpen(): void; native: boolean }) {
  useLanguage();
  const [focused, setFocused] = useState(false);
  const label = t(count === 1 ? "Open Xbox party, {count} member" : "Open Xbox party, {count} members", { count });
  const className = [headerClasses?.HeaderItem, headerClasses?.Clickable, focused && "nexus-party-focused"].filter(Boolean).join(" ");
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative",
    width: 36, minWidth: 0, height: "100%", alignSelf: "stretch", flexShrink: 0,
    border: 0, padding: 0, borderRadius: 0, color: "inherit", cursor: "pointer", touchAction: "manipulation",
  };
  const content = <>
    <style>{`
      button:where([data-nexus-party-badge]) { appearance: none; background: transparent; }
      @media (hover: hover) {
        [data-nexus-party-badge]:hover { background-color: rgb(255 255 255 / 12%); }
      }
      [data-nexus-party-badge]:active { background-color: rgb(255 255 255 / 24%); }
      [data-nexus-party-badge]:is(.nexus-party-focused, .gpfocus, :focus-visible) {
        background: #fff !important; color: #0e141b !important;
        box-shadow: none !important; outline: none !important;
      }
      [data-nexus-party-badge]:is(.nexus-party-focused, .gpfocus, :focus-visible) .nexus-party-count {
        background: #0e141b !important; color: #fff !important;
      }
    `}</style>
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5.1a7 7 0 0 1 13.8 0H17a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h.7a3 3 0 0 1-2.7 2h-2v2h2a5 5 0 0 0 5-4.5 3 3 0 0 0 1-2.5v-4a9 9 0 0 0-9-9Z" />
    </svg>
    <span className="nexus-party-count" aria-hidden="true" style={{
      position: "absolute", top: 2, right: 0, minWidth: 12, height: 12, padding: "0 2px",
      boxSizing: "border-box", lineHeight: "12px", borderRadius: 8, background: "#75b84e",
      color: "#101910", fontSize: 9, fontWeight: "bold", textAlign: "center",
    }}>{count}</span>
  </>;
  if (!native) return <button type="button" tabIndex={-1} className={className} data-nexus-party-badge
    aria-label={label} style={style} onMouseDown={event => event.preventDefault()} onClick={onOpen}>{content}</button>;
  return <Focusable noFocusRing className={className} role="button" data-nexus-party-badge
    onGamepadFocus={() => setFocused(true)} onGamepadBlur={() => setFocused(false)}
    onMouseEnter={() => setFocused(false)} onMouseMove={() => setFocused(false)}
    onOKActionDescription={t("Open Xbox party")} onActivate={onOpen} onClick={onOpen}
    aria-label={label} style={style}>{content}</Focusable>;
}

type HeaderProvider = { type: ElementType; value: unknown };

function headerNavigationProviders(header: HTMLElement): HeaderProvider[] {
  const fiberKey = Object.keys(header).find(key => key.startsWith("__reactFiber$"));
  let fiber = fiberKey ? (header as any)[fiberKey] : null;
  const providers: HeaderProvider[] = [];
  let foundNavigation = false;
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    if (fiber.tag !== 10) continue;
    const context = fiber.type?._context ?? fiber.type;
    const type = context?.Provider;
    if (!type) continue;
    const value = fiber.memoizedProps?.value;
    if (value?.m_Tree && Array.isArray(value?.m_rgChildren)) foundNavigation = true;
    providers.push({ type, value });
  }
  return foundNavigation ? providers : [];
}

function HeaderPortal({ active, renderBadge }: { active: boolean; renderBadge(native: boolean): ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [providers, setProviders] = useState<HeaderProvider[]>([]);
  useEffect(() => {
    if (!active) return;
    let node: HTMLElement | null = null;
    let observer: MutationObserver | undefined;
    let observed: Document | undefined;
    const attach = () => {
      const store = (window as any).SteamUIStore;
      const win = store?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.window as Window | undefined;
      const doc = win?.document;
      if (!doc) return;
      if (observed !== doc) {
        observer?.disconnect();
        observed = doc;
        observer = new MutationObserver(attach);
        observer.observe(doc.documentElement, { childList: true, subtree: true });
      }
      const header = doc.getElementById("header");
      if (!header) return;
      const native = Array.from(header.querySelectorAll("[data-nexus-party-badge]")).find(item => !node?.contains(item));
      if (native) {
        if (node) { node.remove(); node = null; setHost(null); }
        return;
      }
      const nextProviders = headerNavigationProviders(header);
      setProviders(previous => previous.length === nextProviders.length && previous.every((provider, index) =>
        provider.type === nextProviders[index].type && provider.value === nextProviders[index].value) ? previous : nextProviders);
      if (node?.parentElement === header) return;
      node?.remove();
      node = doc.createElement("div");
      node.className = "nexus-party-status-host";
      Object.assign(node.style, { display: "flex", alignItems: "stretch", alignSelf: "stretch", height: "100%", flexShrink: "0", pointerEvents: "auto" });
      const clock = Array.from(header.children).find(child => /[0-9]{1,2}:[0-9]{2}/.test(child.textContent || ""));
      header.insertBefore(node, clock || header.lastElementChild);
      setHost(node);
    };
    attach();
    const timer = setInterval(attach, 1000);
    return () => { clearInterval(timer); observer?.disconnect(); node?.remove(); setHost(null); };
  }, [active]);
  if (!host || !active) return null;
  const dom = (window as any).SP_REACTDOM;
  let content = renderBadge(providers.length > 0);
  // Walk from the closest provider outwards, matching the target header ancestry.
  for (const provider of providers) content = createElement(provider.type, { value: provider.value }, content);
  return dom?.createPortal(content, host) ?? null;
}

export function installPartyBadge(onOpen: () => void) {
  let count = 0;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  const snapshot = () => count;
  function Badge() {
    const members = useSyncExternalStore(subscribe, snapshot);
    return members > 0 ? <PartyBadge count={members} onOpen={onOpen} native /> : null;
  }
  function Fallback() {
    const members = useSyncExternalStore(subscribe, snapshot);
    return <HeaderPortal active={members > 0} renderBadge={native => <PartyBadge count={members} onOpen={onOpen} native={native} />} />;
  }
  routerHook.addGlobalComponent(badgeKey, Fallback);
  const module = findModule((value: any) => typeof value === "object" && Object.values(value).some((item: any) =>
    typeof item?.type === "function" && item.type.toString().includes("quickAccessHeader") && item.type.toString().includes("BShowHeader")));
  const headers = module ? Object.values(module).filter((item: any) => typeof item?.type === "function"
    && item.type.toString().includes("quickAccessHeader") && item.type.toString().includes("BShowHeader")) as any[] : [];
  const patches = headers.map(header => afterPatch(header, "type", (_args: any[], tree: any) => {
    if (Array.isArray(tree?.props?.children)) {
      if (tree.props.children.some((item: any) => item?.key === badgeKey)) return tree;
      return cloneElement(tree, {}, <Badge key={badgeKey} />, ...tree.props.children);
    }
    const row = tree?.props?.children;
    const groups = row?.props?.children;
    if (!Array.isArray(groups)) return tree;
    let index = groups.length - 1;
    while (index >= 0 && !Array.isArray(groups[index]?.props?.children)) index--;
    if (index < 0) return tree;
    const group = groups[index];
    const items = group.props.children;
    if (items.some((item: any) => item?.key === badgeKey)) return tree;
    const updated = [...groups];
    updated[index] = cloneElement(group, {}, <Badge key={badgeKey} />, ...items);
    return cloneElement(tree, {}, cloneElement(row, {}, ...updated));
  }));
  return {
    update(members: number) {
      if (members === count) return;
      count = members;
      listeners.forEach(listener => listener());
    },
    remove() {
      this.update(0);
      routerHook.removeGlobalComponent(badgeKey);
      patches.reverse().forEach(patch => patch.unpatch());
      listeners.clear();
    },
  };
}
