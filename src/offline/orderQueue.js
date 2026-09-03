const DB_NAME = 'wrap-roll-pos-offline';
const STORE_NAME = 'orders';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'queueId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline order storage'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline order storage request failed'));
  });
}

export async function enqueueOrder(payload) {
  const database = await openDatabase();
  const entry = {
    queueId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    payload,
  };
  await requestResult(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).add(entry));
  database.close();
  return entry;
}

export async function getQueuedOrders() {
  const database = await openDatabase();
  const entries = await requestResult(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll());
  database.close();
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueuedOrder(queueId) {
  const database = await openDatabase();
  await requestResult(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(queueId));
  database.close();
}

export async function getQueuedOrderCount() {
  const database = await openDatabase();
  const count = await requestResult(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count());
  database.close();
  return count;
}
