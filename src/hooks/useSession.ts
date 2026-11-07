import { useCallback, useEffect, useRef, useState } from "react";
import {
  addBlockReason,
  loadSession,
  reduceSession,
  saveSession,
  sessionToHash,
  type Action,
  type Session,
} from "../domain/session";

export function useSession() {
  const [session, setSession] = useState<Session>(() => loadSession(window.localStorage, window.location.hash));
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const previous = useRef("");

  useEffect(() => {
    const serialized = JSON.stringify(session);
    saveSession(window.localStorage, session);
    const nextHash = sessionToHash(session);
    const currentHash = window.location.hash;
    if (currentHash !== nextHash && decodeURIComponent(currentHash) !== nextHash) {
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(null, "", nextUrl);
    }
    if (previous.current && previous.current !== serialized) {
      setSaved(true);
      const timeout = window.setTimeout(() => setSaved(false), 1400);
      previous.current = serialized;
      return () => window.clearTimeout(timeout);
    }
    previous.current = serialized;
  }, [session]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const dispatch = useCallback((action: Action) => {
    setSession((current) => reduceSession(current, action));
  }, []);

  const addTitle = useCallback((titleId: string) => {
    setSession((current) => {
      const reason = addBlockReason(current, titleId);
      if (reason === "full") {
        queueMicrotask(() => setNotice("Four titles fill the table. Remove one to bring in another."));
        return current;
      }
      if (reason) return current;
      queueMicrotask(() => setNotice(null));
      return reduceSession(current, { type: "add", titleId });
    });
  }, []);

  return { session, saved, notice, dispatch, addTitle };
}
