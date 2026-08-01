import {
  createOperationalGatewayWithHostingerStructure,
} from "./operator-hostinger-structure-composition.mjs";
import {
  startOperatorGatewayHttpServer,
} from "./operator-hostinger-structure-server.mjs";

async function closeServer(server) {
  if (!server?.listening) return;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function normalizeAddress(address) {
  if (!address || typeof address === "string") {
    throw new Error("operational gateway did not expose a TCP address");
  }

  const hostname =
    address.family === "IPv6" ? `[${address.address}]` : address.address;

  return Object.freeze({
    address: address.address,
    family: address.family,
    port: address.port,
    baseUrl: `http://${hostname}:${address.port}`,
  });
}

export async function startOperationalGatewayServer({
  port = 0,
  host = "127.0.0.1",
  maxBodyBytes,
  ...compositionOptions
} = {}) {
  const composition =
    createOperationalGatewayWithHostingerStructure(compositionOptions);
  const server = await startOperatorGatewayHttpServer({
    port,
    host,
    app: composition.app,
    maxBodyBytes,
  });
  const address = normalizeAddress(server.address());

  return Object.freeze({
    ...composition,
    server,
    address,
    baseUrl: address.baseUrl,
    close: () => closeServer(server),
  });
}
