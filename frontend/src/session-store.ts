export const SESSION_DB = "blackjack-studio";
export const SESSION_STORE = "sessions";
export const ACTIVE_SESSION = "active";

export class StorageFailure extends Error {
  constructor() {
    super(
      "Browser storage is unavailable or full. Allow site storage, free space, or try another browser.",
    );
  }
}
export interface SessionStore {
  read(): Promise<unknown | null>;
  change<T>(
    operation: (current: unknown | null) => {
      value: unknown | null;
      result: T;
    },
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
  async read(): Promise<unknown | null> {
    const db = await this.connect();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(SESSION_STORE, "readonly");
        const request = transaction
          .objectStore(SESSION_STORE)
          .get(ACTIVE_SESSION);
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
  async change<T>(
    operation: (current: unknown | null) => {
      value: unknown | null;
      result: T;
    },
  ): Promise<T> {
    const db = await this.connect();
    return new Promise<T>((resolve, reject) => {
      try {
        const transaction = db.transaction(SESSION_STORE, "readwrite");
        const store = transaction.objectStore(SESSION_STORE);
        const request = store.get(ACTIVE_SESSION);
        let result: T, failure: unknown;
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? new StorageFailure());
        request.onsuccess = () => {
          let next: { value: unknown | null; result: T };
          try {
            next = operation(request.result ?? null);
          } catch (error) {
            failure = error;
            transaction.abort();
            return;
          }
          try {
            result = next.result;
            if (next.value === null) store.delete(ACTIVE_SESSION);
            else store.put(next.value, ACTIVE_SESSION);
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
