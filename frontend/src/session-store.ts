export const SESSION_DB = "blackjack-studio";
export const SESSION_STORE = "sessions";
export const ACTIVE_SESSION = "active";
export const SESSION_HISTORY = "history";
export const ARCHIVE_PREFIX = "history:";

export interface StoreChange<T> {
  value: unknown | null;
  result: T;
  history?: unknown;
  archive?: { id: string; value: unknown };
  clearArchives?: boolean;
}
export interface HistoryRead {
  history: unknown | null;
  archives: unknown[];
}

export class StorageFailure extends Error {
  constructor() {
    super(
      "Browser storage is unavailable or full. Allow site storage, free space, or try another browser.",
    );
  }
}
export interface SessionStore {
  read(key?: string): Promise<unknown | null>;
  readHistory(): Promise<HistoryRead>;
  change<T>(
    operation: (
      current: unknown | null,
      history: unknown | null,
    ) => StoreChange<T>,
  ): Promise<T>;
}

/** One atomic read/compare/write transaction across tabs; never resolve before commit. */
export class IndexedDbSessionStore implements SessionStore {
  private connection: Promise<IDBDatabase> | null = null;
  constructor(
    private factory?: IDBFactory,
    private name = SESSION_DB,
  ) {}
  private connect(): Promise<IDBDatabase> {
    if (!this.connection) {
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        let failed = false;
        const fail = () => {
          failed = true;
          reject(new StorageFailure());
        };
        let request: IDBOpenDBRequest;
        try {
          const factory = this.factory ?? globalThis.indexedDB;
          if (!factory) {
            fail();
            return;
          }
          request = factory.open(this.name, 1);
        } catch {
          fail();
          return;
        }
        request.onerror = fail;
        request.onblocked = fail;
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(SESSION_STORE))
            request.result.createObjectStore(SESSION_STORE);
        };
        request.onsuccess = () => {
          const db = request.result;
          if (failed) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.connection = null;
          };
          resolve(db);
        };
      }).catch((error) => {
        this.connection = null;
        throw error;
      });
    }
    return this.connection;
  }
  async read(key = ACTIVE_SESSION): Promise<unknown | null> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(SESSION_STORE, "readonly");
        const request = transaction.objectStore(SESSION_STORE).get(key);
        let value: unknown | null = null;
        request.onsuccess = () => {
          value = request.result ?? null;
        };
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = () => reject(new StorageFailure());
      } catch {
        reject(new StorageFailure());
      }
    });
  }
  /** A consistent read of metadata and archives, even while another tab ends. */
  async readHistory(): Promise<HistoryRead> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(SESSION_STORE, "readonly");
        const store = transaction.objectStore(SESSION_STORE);
        const result: HistoryRead = { history: null, archives: [] };
        const metadata = store.get(SESSION_HISTORY);
        metadata.onsuccess = () => {
          result.history = metadata.result ?? null;
        };
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (
            typeof cursor.key === "string" &&
            cursor.key.startsWith(ARCHIVE_PREFIX)
          )
            result.archives.push(cursor.value);
          cursor.continue();
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new StorageFailure());
      } catch {
        reject(new StorageFailure());
      }
    });
  }
  async change<T>(
    operation: (
      current: unknown | null,
      history: unknown | null,
    ) => StoreChange<T>,
  ): Promise<T> {
    const db = await this.connect();
    return new Promise<T>((resolve, reject) => {
      try {
        const transaction = db.transaction(SESSION_STORE, "readwrite");
        const store = transaction.objectStore(SESSION_STORE);
        // Read both keys within this same atomic cross-tab transaction.
        const historyRequest = store.get(SESSION_HISTORY);
        const request = store.get(ACTIVE_SESSION);
        let result: T, failure: unknown;
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? new StorageFailure());
        request.onsuccess = () => {
          let next: StoreChange<T>;
          try {
            next = operation(
              request.result ?? null,
              historyRequest.result ?? null,
            );
          } catch (error) {
            failure = error;
            transaction.abort();
            return;
          }
          try {
            result = next.result;
            if (next.value === null) store.delete(ACTIVE_SESSION);
            else store.put(next.value, ACTIVE_SESSION);
            if (next.history !== undefined)
              store.put(next.history, SESSION_HISTORY);
            if (next.archive)
              store.add(next.archive.value, ARCHIVE_PREFIX + next.archive.id);
            if (next.clearArchives) {
              const cursorRequest = store.openCursor();
              cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (!cursor) return;
                if (
                  typeof cursor.key === "string" &&
                  cursor.key.startsWith(ARCHIVE_PREFIX)
                )
                  cursor.delete();
                cursor.continue();
              };
            }
          } catch {
            failure = new StorageFailure();
            transaction.abort();
          }
        };
      } catch {
        reject(new StorageFailure());
      }
    });
  }
}
