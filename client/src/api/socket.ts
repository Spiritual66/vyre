import { io } from 'socket.io-client';

// Derive server URL from VITE_API_URL (set for Capacitor/Electron builds)
// or fall back to localhost in dev / same origin in production web
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
const SERVER_URL = apiUrl
  ? apiUrl.replace(/\/api\/?$/, '')
  : import.meta.env.DEV
    ? 'http://localhost:3001'
    : window.location.origin;

let socket: ReturnType<typeof io> | null = null;

export const getSocket = (token: string) => {
  if (!socket) {
    socket = io(SERVER_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
