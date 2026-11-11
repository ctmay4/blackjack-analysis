import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./pwa.css";

export default function PwaStatus() {
  const [failed, setFailed] = useState(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      setFailed(true);
    },
    onRegisteredSW(_url, registration) {
      // Check when returning to practice, not just on the first visit.
      window.addEventListener("online", () => {
        void registration?.update().catch(() => {});
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine)
          void registration?.update().catch(() => {});
      });
    },
  });

  if (!offlineReady && !needRefresh && !failed) return null;

  return (
    <aside className="pwa-status" aria-label="App availability">
      <p role="status">
        {needRefresh
          ? "An update is ready. Reload to apply it in open app tabs; saved practice is kept."
          : failed
            ? "Offline setup failed. You can keep practicing; reconnect and reload to retry."
            : "Ready for offline use on this device."}
      </p>
      {needRefresh && (
        <button
          type="button"
          onClick={() =>
            void updateServiceWorker(true).catch(() => setFailed(true))
          }
        >
          Reload to update
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setOfflineReady(false);
          setNeedRefresh(false);
          setFailed(false);
        }}
      >
        {needRefresh ? "Later" : "Dismiss"}
      </button>
    </aside>
  );
}
