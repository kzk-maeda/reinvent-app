import type { ReviewItem } from "../shared/domain.ts";
const name = "english-lab-cards-v1";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveOffline(items: ReviewItem[]) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("data", "readwrite");
    t.objectStore("data").put({ items, savedAt: Date.now() }, "cards");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  d.close();
}
export async function readOffline(): Promise<
  { items: ReviewItem[]; savedAt: number } | undefined
> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("data").objectStore("data").get("cards");
    r.onsuccess = () => {
      d.close();
      const data = r.result;
      resolve(
        data && Date.now() - data.savedAt < 30 * 86400000 ? data : undefined,
      );
    };
    r.onerror = () => {
      d.close();
      reject(r.error);
    };
  });
}
export async function clearOffline() {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("data", "readwrite");
    t.objectStore("data").clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  d.close();
  for (const k of await caches.keys())
    if (k.startsWith("english-lab-")) await caches.delete(k);
  localStorage.removeItem("lab-ui");
}
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("english-lab")
    : undefined;
channel?.addEventListener("message", (e) => {
  if (e.data === "clear") void clearOffline().then(() => location.reload());
});
export async function purgeOffline() {
  await clearOffline();
  channel?.postMessage("clear");
}
