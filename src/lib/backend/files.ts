/**
 * Petit magasin de fichiers dans le navigateur (IndexedDB), pour le mode
 * démo local : les pages d'un exemple pèsent vite plusieurs mégaoctets, bien
 * au-delà de ce que le localStorage accepte.
 *
 * Un fichier rangé ici est désigné par une adresse « idb:<clé> » ; `resolve`
 * la transforme en adresse affichable par le navigateur.
 */

const DB_NAME = "ms-diapo";
const STORE = "files";
export const IDB_PREFIX = "idb:";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function putFile(key: string, blob: Blob): Promise<string> {
  await run("readwrite", (s) => s.put(blob, key));
  return IDB_PREFIX + key;
}

/** Supprime tous les fichiers dont la clé commence par `prefix`. */
export async function deleteFiles(prefix: string): Promise<void> {
  const range = IDBKeyRange.bound(prefix, prefix + "￿");
  await run("readwrite", (s) => s.delete(range));
  for (const [key, url] of urls) {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }
}

/** Adresses déjà créées, pour ne pas en fabriquer une nouvelle à chaque lecture. */
const urls = new Map<string, string>();

/** Chemin inverse : adresse affichable (blob:) → adresse « idb: » enregistrée. */
export function unresolve(url: string): string {
  for (const [key, objectUrl] of urls) if (objectUrl === url) return IDB_PREFIX + key;
  return url;
}

export async function deleteFile(url: string): Promise<void> {
  const stored = unresolve(url);
  if (!stored.startsWith(IDB_PREFIX)) return;
  const key = stored.slice(IDB_PREFIX.length);
  await run("readwrite", (s) => s.delete(key));
  const objectUrl = urls.get(key);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  urls.delete(key);
}

/** Adresse affichable d'un fichier ; les autres adresses sont rendues telles quelles. */
export async function resolve(url: string): Promise<string> {
  if (!url.startsWith(IDB_PREFIX)) return url;
  const key = url.slice(IDB_PREFIX.length);
  const hit = urls.get(key);
  if (hit) return hit;
  const blob = await run<Blob>("readonly", (s) => s.get(key) as IDBRequest<Blob>);
  if (!blob) return "";
  const objectUrl = URL.createObjectURL(blob);
  urls.set(key, objectUrl);
  return objectUrl;
}
