import { z } from "zod";
import { TrainerSession } from "./engine/trainer";
import { sessionConfig } from "./engine/session-config";
import { seededRandom } from "./engine/cards";
import type { TrainerCheckpoint } from "./engine/checkpoint";
import type { Action } from "./engine/types";
import type {
  ChartSection,
  SessionToken,
  Snapshot,
} from "./engine/session-types";
import { IndexedDbSessionStore, StorageFailure } from "./session-store";
import {
  activeJournal,
  archiveJournal,
  beginJournal,
  captureDecision,
  emptyHistory,
  HistoryFailure,
  historySummary,
  parseHistory,
  parseArchive,
  recordReview,
} from "./session-history";
import type { SessionHistory, SessionJournal } from "./session-history";
import type { SessionStore } from "./session-store";

export type SessionErrorCode =
  | "missing"
  | "stale"
  | "storage"
  | "corrupt"
  | "unsupported"
  | "invalid"
  | "history";
export class SessionError extends Error {
  constructor(
    public code: SessionErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export interface SavedSession {
  version: 1;
  id: string;
  revision: number;
  trainer: TrainerCheckpoint;
}
const envelope = z.strictObject({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  trainer: z.unknown(),
});
interface CurrentSession {
  id: string;
  revision: number;
  session: TrainerSession;
}

function decode(value: unknown): CurrentSession {
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version !== 1
  )
    throw new SessionError(
      "unsupported",
      "This saved session uses an unsupported version. It has not been changed.",
    );
  try {
    const saved = envelope.parse(value);
    if (
      saved.trainer &&
      typeof saved.trainer === "object" &&
      "format" in saved.trainer &&
      saved.trainer.format !== 1
    )
      throw new SessionError(
        "unsupported",
        "This saved session uses an unsupported engine version. It has not been changed.",
      );
    return {
      id: saved.id,
      revision: saved.revision,
      session: TrainerSession.restore(saved.trainer),
    };
  } catch (error) {
    if (error instanceof SessionError) throw error;
    throw new SessionError(
      "corrupt",
      "The saved session could not be read. It has not been changed. You can discard it to start fresh.",
    );
  }
}
function current(value: unknown | null): CurrentSession {
  if (value === null)
    throw new SessionError(
      "missing",
      "This session has ended in another tab. Start a new practice session.",
    );
  return decode(value);
}
function check(current: CurrentSession, token: SessionToken) {
  if (current.id !== token.session_id || current.revision !== token.revision)
    throw new SessionError(
      "stale",
      "This session changed in another tab. Your choice was not replayed.",
    );
}
const snapshot = (value: CurrentSession): Snapshot => ({
  ...value.session.snapshot(),
  session_id: value.id,
  revision: value.revision,
});
const saved = (value: CurrentSession): SavedSession => ({
  version: 1,
  id: value.id,
  revision: value.revision,
  trainer: value.session.checkpoint(),
});

/** Controller owns lifecycle, storage and revisions, never blackjack rules. */
export class SessionController {
  constructor(
    private store: SessionStore,
    private entropy: { seed: () => number; id: () => string } = {
      seed: () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0],
      id: () => globalThis.crypto.randomUUID(),
    },
    private now: () => number = () => Date.now(),
  ) {}
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SessionError) throw error;
      if (error instanceof HistoryFailure)
        throw new SessionError("history", error.message);
      if (error instanceof StorageFailure)
        throw new SessionError("storage", error.message);
      throw new SessionError(
        "invalid",
        error instanceof Error
          ? error.message
          : "The operation failed. No changes were saved.",
      );
    }
  }
  private create(
    config: unknown,
    sessions: SessionJournal[] = [],
  ): TrainerSession {
    return new TrainerSession(config, {
      random: seededRandom(this.entropy.seed()),
      drillSituations:
        sessionConfig(config).practice === "missed"
          ? [
              ...new Set(
                sessions.flatMap((session) =>
                  session.stats.openingMisses.map(([key]) => key),
                ),
              ),
            ]
          : [],
    });
  }
  load(): Promise<Snapshot | null> {
    return this.run(async () => {
      const value = await this.store.read();
      return value === null ? null : snapshot(decode(value));
    });
  }
  start(config: unknown): Promise<Snapshot> {
    return this.run(() =>
      this.store.change(
        (value, rawHistory, archives) => {
          if (value !== null) {
            current(value);
            throw new SessionError(
              "stale",
              "A session already exists. The latest state has been loaded.",
            );
          }
          const history = parseHistory(rawHistory);
          if (history.active)
            throw new HistoryFailure(
              "corrupt",
              "Saved history has an orphaned active session. It has not been changed. Delete saved history explicitly to recover.",
            );
          const next = {
            id: this.entropy.id(),
            revision: 0,
            session: this.create(config, [
              ...history.sessions,
              ...archives.map(parseArchive),
            ]),
          };
          history.active = beginJournal(next.id, next.session, this.now());
          recordReview(history.active, next.session);
          return { value: saved(next), result: snapshot(next), history };
        },
        sessionConfig(config).practice === "missed",
      ),
    );
  }
  private update(
    token: SessionToken,
    operation: (
      session: TrainerSession,
      sessions: SessionJournal[],
    ) => TrainerSession,
    replaceId = false,
    action?: Action,
    includeArchives = false,
  ): Promise<Snapshot> {
    return this.run(() =>
      this.store.change((value, rawHistory, archives) => {
        const before = current(value);
        check(before, token);
        if (before.revision === Number.MAX_SAFE_INTEGER)
          throw new SessionError(
            "invalid",
            "End this session and start a new one to reset its revision counter.",
          );
        const history = parseHistory(rawHistory);
        const journal = activeJournal(
          history,
          before.id,
          before.session,
          this.now(),
          before.revision,
        );
        recordReview(journal, before.session);
        const attempt = action ? captureDecision(before.session, action) : null;
        const next = {
          id: replaceId ? this.entropy.id() : before.id,
          revision: before.revision + 1,
          session: operation(
            before.session,
            includeArchives
              ? [...history.sessions, ...archives.map(parseArchive), journal]
              : [],
          ),
        };
        let archive;
        if (replaceId) {
          archive = archiveJournal(history, journal, this.now(), "replaced");
          history.active = beginJournal(
            next.id,
            next.session,
            this.now(),
            false,
            next.revision,
          );
        } else history.active = journal;
        history.active.revision = next.revision;
        recordReview(history.active, next.session, attempt);
        return { value: saved(next), result: snapshot(next), history, archive };
      }, includeArchives),
    );
  }
  choose(token: SessionToken, action: Action | "next"): Promise<Snapshot> {
    return this.update(
      token,
      (session) => {
        if (action === "next") session.nextRound();
        else session.choose(action);
        return session;
      },
      false,
      action === "next" ? undefined : action,
    );
  }
  reset(token: SessionToken, config: unknown): Promise<Snapshot> {
    return this.run(() =>
      this.update(
        token,
        (_session, sessions) => this.create(config, sessions),
        true,
        undefined,
        sessionConfig(config).practice === "missed",
      ),
    );
  }
  end(token: SessionToken): Promise<null> {
    return this.run(() =>
      this.store.change((value, rawHistory) => {
        const before = current(value);
        check(before, token);
        const history = parseHistory(rawHistory);
        const journal = activeJournal(
          history,
          before.id,
          before.session,
          this.now(),
          before.revision,
        );
        recordReview(journal, before.session);
        const archive = archiveJournal(history, journal, this.now(), "ended");
        return { value: null, result: null, history, archive };
      }),
    );
  }
  history(): Promise<SessionHistory> {
    return this.run(async () => {
      const { history: rawHistory, archives } = await this.store.readHistory();
      const metadata = parseHistory(rawHistory);
      metadata.sessions.push(...archives.map(parseArchive));
      const history = parseHistory(metadata);
      return {
        sessions: history.sessions
          .slice()
          .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)),
        totals: historySummary(history.sessions),
      };
    });
  }
  /** Explicit deletion, never changes the active game or its score. */
  clearHistory(): Promise<null> {
    return this.run(() =>
      this.store.change((value, rawHistory) => {
        const history = emptyHistory();
        try {
          history.active = parseHistory(rawHistory).active;
        } catch (error) {
          if (!(error instanceof HistoryFailure)) throw error;
        }
        return { value, result: null, history, clearArchives: true };
      }),
    );
  }
  chart(token?: SessionToken): Promise<ChartSection[]> {
    return this.run(async () => {
      const active = current(await this.store.read());
      if (token) check(active, token);
      return active.session.strategyChart();
    });
  }
  /** Explicit recovery only; never silently erase corrupt or future-version data. */
  discardSavedSession(): Promise<null> {
    return this.run(() =>
      this.store.change((_value, rawHistory) => {
        try {
          const history = parseHistory(rawHistory);
          history.active = null;
          return { value: null, result: null, history };
        } catch (error) {
          if (!(error instanceof HistoryFailure)) throw error;
          return { value: null, result: null };
        }
      }),
    );
  }
}
export const sessionController = new SessionController(
  new IndexedDbSessionStore(),
);
