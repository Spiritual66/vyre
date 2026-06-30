import api from './axios';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Request permission (if needed), subscribe via the SW, and register with the server.
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const { data } = await api.get('/push/vapid-public-key');
    if (!data?.key) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
    return true;
  } catch {
    return false;
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch { /* ignore */ }
}
