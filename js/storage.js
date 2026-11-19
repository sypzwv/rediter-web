const DB_NAME = "rediter-local";
const DB_VERSION = 1;
const BOOK_STORE = "books";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

let databasePromise;
export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BOOK_STORE)) {
        const store = database.createObjectStore(BOOK_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

export async function listBooks() {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readonly");
  const books = await requestResult(transaction.objectStore(BOOK_STORE).getAll());
  return books.sort((a, b) => (b.lastOpenedAt || b.importedAt) - (a.lastOpenedAt || a.importedAt));
}

export async function getBook(id) {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readonly");
  return requestResult(transaction.objectStore(BOOK_STORE).get(id));
}

export async function putBook(book) {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readwrite");
  transaction.objectStore(BOOK_STORE).put(book);
  await transactionDone(transaction);
  return book;
}

export async function deleteBook(id) {
  const database = await openDatabase();
  const transaction = database.transaction(BOOK_STORE, "readwrite");
  transaction.objectStore(BOOK_STORE).delete(id);
  await transactionDone(transaction);
}

export function loadSettings() {
  try {
    return { fontSize: 18, theme: "light", ...JSON.parse(localStorage.getItem("rediter-settings") || "{}") };
  } catch {
    return { fontSize: 18, theme: "light" };
  }
}

export function saveSettings(settings) {
  localStorage.setItem("rediter-settings", JSON.stringify(settings));
}
