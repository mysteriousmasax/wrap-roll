import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const retryRef = useRef(null);
  const closedManually = useRef(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (closedManually.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev mode connect directly to the API server to avoid
    // conflicts between Vite's HMR WebSocket and the /ws proxy.
    const configuredUrl = import.meta.env.VITE_WS_URL;
    const ws = new WebSocket(configuredUrl || `${protocol}//${import.meta.env.DEV ? 'localhost:3000' : window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const { event: type, data } = JSON.parse(event.data);
        onMessageRef.current?.(type, data);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (closedManually.current) return;
      retryRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    closedManually.current = false;
    // Defer the initial connect so React StrictMode's mount → unmount →
    // remount cycle can cancel it before a socket is ever created.
    const initRef = { id: setTimeout(connect, 0) };
    return () => {
      closedManually.current = true;
      clearTimeout(initRef.id);
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
