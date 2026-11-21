"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type RefreshEvent = "workspace" | "notifications" | "conversation" | "reviews" |
  "client-projects" | "client-records" | "payments" | "access" | "members";
type Listener = { event: RefreshEvent | null; refresh: () => void };
type Subscription = {
  listeners: Set<Listener>;
  channel?: RealtimeChannel;
  joined: boolean;
  closing?: Promise<unknown>;
};
const subscriptions = new Map<string, Subscription>();

export const userRefreshTopic = (userId?: string | null) => userId ? `pms:user:${userId}` : undefined;
export const managerRefreshTopic = "pms:managers";
export const adminRefreshTopic = "pms:admins";

function updateChannel(topic: string, entry: Subscription) {
  if (!supabase || entry.closing) return;
  const client = supabase;
  if (document.hidden || !entry.listeners.size) {
    if (entry.channel) {
      const channel = entry.channel;
      entry.channel = undefined;
      entry.joined = false;
      entry.closing = client.removeChannel(channel).finally(() => {
        entry.closing = undefined;
        updateChannel(topic, entry);
      });
    } else if (!entry.listeners.size) {
      subscriptions.delete(topic);
    }
    return;
  }
  if (entry.channel) return;
  const channel = client.channel(topic, { config: { private: true } });
  entry.channel = channel;
  channel.on("broadcast", { event: "*" }, ({ event }) => {
    if (entry.channel !== channel) return;
    for (const listener of entry.listeners) {
      if (listener.event === event) listener.refresh();
    }
  }).subscribe(status => {
    if (entry.channel !== channel) return;
    if (status === "CLOSED") entry.channel = undefined;
    entry.joined = status === "SUBSCRIBED";
    // Catch up after a join, including reconnects and time spent in a hidden tab.
    if (entry.joined) {
      for (const listener of entry.listeners) listener.refresh();
    }
  });
}

export function subscribeToRefresh(
  event: RefreshEvent | null,
  topic: string | undefined,
  refresh: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRefresh = 0;
  function runRefresh() {
    if (document.hidden) return;
    lastRefresh = Date.now();
    refresh();
  }
  function schedule() {
    if (document.hidden || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      runRefresh();
    }, 250);
  }
  function recover() {
    // When Realtime is unavailable, a user returning to the page can still catch up.
    if (document.hidden || entry?.joined || Date.now() - lastRefresh <= 5000) return;
    if (topic && entry) {
      updateChannel(topic, entry);
      schedule();
    } else {
      runRefresh();
    }
  }
  const entry = topic && event && supabase ? subscriptions.get(topic) ?? { listeners: new Set<Listener>(), joined: false } : undefined;
  const listener = { event, refresh: schedule };
  function onVisibilityChange() {
    if (topic && entry) updateChannel(topic, entry);
    if (!entry) recover();
  }
  if (topic && entry) {
    subscriptions.set(topic, entry);
    entry.listeners.add(listener);
    updateChannel(topic, entry);
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", recover);
  window.addEventListener("online", recover);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", recover);
    window.removeEventListener("online", recover);
    if (topic && entry) {
      entry.listeners.delete(listener);
      updateChannel(topic, entry);
    }
  };
}

export function useLiveRefresh(
  event: RefreshEvent | null,
  topic: string | undefined,
  refresh: () => void,
  enabled = true,
) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  useEffect(() => {
    if (enabled) return subscribeToRefresh(event, topic, () => callback.current());
  }, [event, topic, enabled]);
}
