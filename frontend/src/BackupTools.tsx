import { useRef, useState } from "react";
import { sessionController } from "./session-controller";
import { downloadFile, historyCsv } from "./data-export";

export default function BackupTools({
  onRestore,
}: {
  onRestore: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await operation();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Data operation failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportData = (kind: "backup" | "json" | "csv") =>
    run(async () => {
      const stamp = new Date().toISOString().slice(0, 10);
      const content =
        kind === "backup"
          ? await sessionController.backup()
          : kind === "csv"
            ? historyCsv(await sessionController.history())
            : JSON.stringify(
                {
                  format: "blackjack-studio-history",
                  version: 1,
                  ...(await sessionController.history()),
                },
                null,
                2,
              );
      downloadFile(
        `blackjack-${kind}-${stamp}.${kind === "csv" ? "csv" : "json"}`,
        content,
        kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
      );
      setMessage("Download prepared. Keep backup files somewhere safe.");
    });
  return (
    <section aria-label="Backup and export">
      <h3>Backup and export</h3>
      <p className="form-note">
        Full JSON backups include active practice (including hidden cards),
        settings, and all saved history. History JSON includes retained reviews;
        CSV contains ended-session summaries only. History exports cannot be
        restored as backups. Files stay on your device; nothing is uploaded.
      </p>
      <div className="history-tools">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void exportData("backup")}
        >
          Download backup
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void exportData("json")}
        >
          Export history JSON
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void exportData("csv")}
        >
          Export history CSV
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Restore backup
        </button>
      </div>
      <p className="form-note">
        Restore replaces all local practice and history, not merges it. Download
        a backup first. Maximum file size: 25 MiB. Existing tabs must reload
        after restore.
      </p>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Backup file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void run(async () => {
            if (file.size > 25 * 1024 * 1024)
              throw new Error("Backup exceeds the 25 MiB limit.");
            const text = await file.text();
            if (
              !window.confirm(
                "Replace ALL local practice and saved history with this backup? This cannot be undone. Download a backup first. Other tabs must reload.",
              )
            )
              return;
            await sessionController.restoreBackup(text);
            await onRestore();
            setMessage("Backup restored. Other open tabs must reload.");
          });
        }}
      />
      {message && (
        <p role="status" className="form-note">
          {message}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
