"use client";

/**
 * Antrean absensi offline (IndexedDB). Satu entri per karyawan per tanggal, sehingga
 * input ulang saat masih offline menimpa input sebelumnya. Entri diberi `userId` agar
 * hanya disinkron oleh akun yang menginputnya.
 */

import type { AbsensiRow } from "@/app/(app)/absensi/actions";

export interface QueueEntry {
  key: string; // `${userId}|${employee_id}|${tanggal}`
  userId: string;
  tanggal: string;
  row: AbsensiRow;
  dicatat_pada: string; // ISO, waktu input di HP
}

const DB = "mps-offline";
const STORE = "absensi";
export const QUEUE_EVENT = "mps-offline-queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" }).createIndex("userId", "userId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r ? (r as IDBRequest<T>).result : undefined);
    };
    t.onerror = () => reject(t.error);
  });
}

const notify = () => window.dispatchEvent(new Event(QUEUE_EVENT));

export async function enqueue(userId: string, tanggal: string, rows: AbsensiRow[]) {
  const now = new Date().toISOString();
  await tx("readwrite", (s) => {
    for (const row of rows) s.put({ key: `${userId}|${row.employee_id}|${tanggal}`, userId, tanggal, row, dicatat_pada: now } satisfies QueueEntry);
  });
  notify();
}

export async function listQueue(userId: string): Promise<QueueEntry[]> {
  const all = (await tx<QueueEntry[]>("readonly", (s) => s.index("userId").getAll(userId))) ?? [];
  return all.sort((a, b) => a.dicatat_pada.localeCompare(b.dicatat_pada));
}

export async function removeKeys(keys: string[]) {
  if (!keys.length) return;
  await tx("readwrite", (s) => {
    for (const k of keys) s.delete(k);
  });
  notify();
}

export function offlineSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}
