import type { WebSocket } from "ws";

export type RealtimeConnection = {
  socket: WebSocket;
  deviceId: string;
  organizationId: string;
  connectedAt: number;
  lastPongAt: number;
};

const connections = new Map<string, Set<RealtimeConnection>>();

export function addConnection(connection: RealtimeConnection): void {
  const set = connections.get(connection.deviceId) ?? new Set<RealtimeConnection>();
  set.add(connection);
  connections.set(connection.deviceId, set);
}

export function removeConnection(connection: RealtimeConnection): void {
  const set = connections.get(connection.deviceId);
  set?.delete(connection);
  if (set && set.size === 0) connections.delete(connection.deviceId);
}

function send(connection: RealtimeConnection, message: Record<string, unknown>): void {
  if (connection.socket.readyState === 1) connection.socket.send(JSON.stringify(message));
}

export function notifyDevices(deviceIds: string[], message: Record<string, unknown>): void {
  for (const deviceId of deviceIds) {
    for (const connection of connections.get(deviceId) ?? []) send(connection, message);
  }
}

export function notifyOrganization(
  organizationId: string,
  deviceIds: string[],
  message: Record<string, unknown>,
): void {
  for (const deviceId of deviceIds) {
    for (const connection of connections.get(deviceId) ?? []) {
      if (connection.organizationId === organizationId) send(connection, message);
    }
  }
}

export function connectionCount(): number {
  let count = 0;
  for (const set of connections.values()) count += set.size;
  return count;
}

export function pingConnections(): void {
  for (const set of connections.values()) {
    for (const connection of set) {
      if (Date.now() - connection.lastPongAt > 90_000) {
        connection.socket.terminate();
      } else if (connection.socket.readyState === 1) {
        connection.socket.ping();
      }
    }
  }
}
