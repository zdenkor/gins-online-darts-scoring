// =================================================================
// IndexedDB wrapper. Schema lives here; everything else just calls.
// Object stores:
//   users       keyPath: id (auto)            indexes: username (unique)
//   settings    keyPath: key                  (single-row config)
//   competitions keyPath: id (auto)           indexes: type, status
//   matches     keyPath: id (auto)            indexes: competitionId, status
//   games       keyPath: id (auto)            indexes: ownerId
//   google-auth-tokens keyPath: key           (Google OAuth tokens)
// All functions return Promises.
// =================================================================

const DB_NAME = 'gindarts';
const DB_VERSION = 4;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('users')) {
        const s = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        s.createIndex('username', 'username', { unique: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('competitions')) {
        const s = db.createObjectStore('competitions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('type', 'type');
        s.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('matches')) {
        const s = db.createObjectStore('matches', { keyPath: 'id', autoIncrement: true });
        s.createIndex('competitionId', 'competitionId');
        s.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('games')) {
        const s = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
        s.createIndex('ownerId', 'ownerId');
      }
      if (!db.objectStoreNames.contains('google-auth-tokens')) {
        // Tokens are stored with no inline keyPath — the helpers
        // pass the key as the second argument to put(). This keeps
        // the stored value a plain object (just the fields the auth
        // code wants), no synthetic `key` property needed.
        db.createObjectStore('google-auth-tokens');
      }
      if (!db.objectStoreNames.contains('players')) {
        // Tournament participants. Distinct from `users` (admin
        // accounts): players don't log in, they just have identity
        // fields for matching and stats.
        //   firstName, surname, middleName  (Sr./Jr./St.Ml.)
        //   town, club                       (home club)
        //   regNumber                        CLUBCODE#NNNNNN — CLUBCODE
        //                                    is 1+ uppercase letters
        //                                    (NR=Nitra, NRZAL=Nitra
        //                                    Zaloha), # is literal, and
        //                                    NNNNNN is exactly 6 digits.
        //                                    Always uppercase, validated.
        //   regAuthority                     ('SVK' | 'OTHER')
        const ps = db.createObjectStore('players', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('surname', 'surname', { unique: false });
        ps.createIndex('regNumber', 'regNumber', { unique: false });
      }
      if (!db.objectStoreNames.contains('svk_players')) {
        // Local cache of the SVK federation license list.
        // Admin imports once (paste from the SVK portal page),
        // we look it up locally — no CORS, no network.
        // Each row: { svkId, setDartsId, name, surname, firstName, town, club }
        // svkId is the unique keyPath (e.g. "SVK003112").
        const sps = db.createObjectStore('svk_players', { keyPath: 'svkId' });
        sps.createIndex('surname', 'surname', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Don't cache the failure. The next call to openDB() will
      // retry. Most common cause: a corrupt DB from a previous
      // version. The user can clear site data in DevTools to fix.
      console.warn('IDB open failed', req.error);
      _dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      console.warn('IDB open blocked — close other tabs');
      _dbPromise = null;
      reject(new Error('idb-blocked'));
    };
  });
  return _dbPromise;
}

function tx(storeNames, mode = 'readonly') {
  return openDB().then(db => {
    const t = db.transaction(storeNames, mode);
    const stores = {};
    for (const n of storeNames) stores[n] = t.objectStore(n);
    return { t, stores, done: new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }) };
  });
}

function reqToPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/* ----- CRUD helpers ----- */
export async function put(storeName, value, key) {
  const { stores, done } = await tx([storeName], 'readwrite');
  // If the caller passes an explicit key, use it. Otherwise let
  // IndexedDB pick one (works for stores with keyPath). For stores
  // without keyPath (like google-auth-tokens), the caller MUST pass
  // a key or each put() will assign a new auto-incrementing key.
  const id = await reqToPromise(stores[storeName].put(value, key));
  await done;
  return id;
}

export async function get(storeName, key) {
  const { stores, done } = await tx([storeName]);
  const v = await reqToPromise(stores[storeName].get(key));
  await done;
  return v;
}

export async function getAll(storeName, indexName, range) {
  const { stores, done } = await tx([storeName]);
  const src = indexName ? stores[storeName].index(indexName) : stores[storeName];
  const v = await reqToPromise(src.getAll(range));
  await done;
  return v;
}

export async function del(storeName, key) {
  const { stores, done } = await tx([storeName], 'readwrite');
  await reqToPromise(stores[storeName].delete(key));
  await done;
}

export async function clear(storeName) {
  const { stores, done } = await tx([storeName], 'readwrite');
  await reqToPromise(stores[storeName].clear());
  await done;
}

/* ----- Settings ----- */
export async function getSettings() {
  const all = await getAll('settings');
  const out = {};
  for (const r of all) out[r.key] = r.value;
  return out;
}

export async function setSetting(key, value) {
  await put('settings', { key, value });
}

/* ----- Seed: ensure default admin exists ----- */
export async function seedIfEmpty() {
  const users = await getAll('users');
  if (users.length > 0) return;
  // Import lazily to avoid a cycle
  const auth = await import('../auth/auth.js');
  const hash = await auth.hashPassword('admin');
  await put('users', {
    username: 'admin',
    displayName: 'Administrator',
    passHash: hash,
    salt: hash.salt,
    role: 'admin',
    createdAt: Date.now(),
  });
}
