import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { createApp } from "./app";
import { assertProductionConfig, env } from "./config/env";
import { isDeviceActive } from "./modules/devices";
import { addConnection, removeConnection, pingConnections } from "./realtime/hub";
import { verifyAccessToken, type AccessClaims } from "./security/tokens";

type UpgradeClaims = Extract<AccessClaims, { typ: "device" }>;
type UpgradeRequest = import("node:http").IncomingMessage & {
  schoolClaims?: { deviceId: string; organizationId: string };
};

function rejectUpgrade(socket: Duplex, status = 401): void {
  socket.write(`HTTP/1.1 ${status} Unauthorized\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export async function startServer() {
  assertProductionConfig();
  const app = await createApp();
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const heartbeatTimer = setInterval(pingConnections, 30_000);
  heartbeatTimer.unref();

  wsServer.on("connection", (socket, request) => {
    const claims = (request as UpgradeRequest).schoolClaims;
    if (!claims) return socket.close(1008, "Missing authentication");
    const connection = {
      socket,
      deviceId: claims.deviceId,
      organizationId: claims.organizationId,
      connectedAt: Date.now(),
      lastPongAt: Date.now(),
    };
    addConnection(connection);
    socket.on("pong", () => {
      connection.lastPongAt = Date.now();
    });
    socket.on("close", () => removeConnection(connection));
    socket.on("error", () => removeConnection(connection));
    socket.send(JSON.stringify({ type: "READY", serverTime: Date.now() }));
  });

  app.server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname !== "/api/v1/realtime") return;
      const header = request.headers.authorization;
      const token = header?.startsWith("Bearer ")
        ? header.slice(7)
        : url.searchParams.get("access_token");
      const claims = token ? verifyAccessToken(token) : null;
      if (!token || !claims || claims.typ !== "device") return rejectUpgrade(socket);
      const active = await isDeviceActive(claims.sub, claims.organizationId).catch(() => false);
      if (!active) return rejectUpgrade(socket);
      (request as UpgradeRequest).schoolClaims = {
        deviceId: claims.sub,
        organizationId: claims.organizationId,
      };
      wsServer.handleUpgrade(request, socket, head, (ws) =>
        wsServer.emit("connection", ws, request),
      );
    } catch {
      rejectUpgrade(socket, 400);
    }
  });

  await app.listen({ host: env.host, port: env.port });
  app.log.info(`School notice backend listening on ${env.host}:${env.port}`);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
