import { ElectrumNetworkProvider } from 'cashscript';
import type { Network } from 'cashscript';
import {
  ElectrumCluster,
  ElectrumTransport,
  ClusterOrder,
  DefaultParameters,
} from 'electrum-cash';
import type { TransportScheme } from 'electrum-cash';

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as Network | undefined) || 'chipnet';

const DEFAULT_SCHEME =
  (process.env.NEXT_PUBLIC_ELECTRUM_SCHEME as TransportScheme | undefined) ||
  ElectrumTransport.WSS.Scheme;
const DEFAULT_TIMEOUT = Math.max(
  1000,
  parseInt(
    process.env.NEXT_PUBLIC_ELECTRUM_TIMEOUT_MS ||
      process.env.ELECTRUM_TIMEOUT_MS ||
      `${DefaultParameters.TIMEOUT}`
  )
);
const DEFAULT_PING_INTERVAL = Math.max(
  1000,
  parseInt(
    process.env.NEXT_PUBLIC_ELECTRUM_PING_MS ||
      process.env.ELECTRUM_PING_MS ||
      `${DefaultParameters.PING_INTERVAL}`
  )
);

type ServerConfig = {
  host: string;
  port: number;
  scheme: TransportScheme;
};

function schemeToDefaultPort(scheme: TransportScheme): number {
  switch (scheme) {
    case ElectrumTransport.TCP.Scheme:
      return ElectrumTransport.TCP.Port;
    case ElectrumTransport.TCP_TLS.Scheme:
      return ElectrumTransport.TCP_TLS.Port;
    case ElectrumTransport.WS.Scheme:
      return ElectrumTransport.WS.Port;
    case ElectrumTransport.WSS.Scheme:
    default:
      return ElectrumTransport.WSS.Port;
  }
}

function parseServer(entry: string): ServerConfig | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      const scheme = (url.protocol.replace(':', '') as TransportScheme) || DEFAULT_SCHEME;
      const host = url.hostname;
      const port = url.port ? parseInt(url.port, 10) : schemeToDefaultPort(scheme);
      if (!host) return null;
      return { host, port, scheme };
    } catch {
      return null;
    }
  }

  const parts = trimmed.split(':').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const [host, portRaw, schemeRaw] = parts;
  const scheme = (schemeRaw as TransportScheme | undefined) || DEFAULT_SCHEME;
  const port = portRaw ? parseInt(portRaw, 10) : schemeToDefaultPort(scheme);
  if (!host || Number.isNaN(port)) return null;
  return { host, port, scheme };
}

function getServerList(): ServerConfig[] {
  const raw =
    process.env.NEXT_PUBLIC_ELECTRUM_SERVERS ||
    process.env.ELECTRUM_SERVERS ||
    '';
  if (raw) {
    const parsed = raw
      .split(',')
      .map(parseServer)
      .filter((server): server is ServerConfig => !!server);
    if (parsed.length) return parsed;
  }

  const host = process.env.NEXT_PUBLIC_ELECTRUM_HOST;
  if (!host) return [];

  const scheme = DEFAULT_SCHEME;
  const port =
    parseInt(process.env.NEXT_PUBLIC_ELECTRUM_PORT || '', 10) ||
    schemeToDefaultPort(scheme);
  return [{ host, port, scheme }];
}

let cachedProvider: ElectrumNetworkProvider | null = null;

export function resetElectrumProvider(): void {
  cachedProvider = null;
}

export function getElectrumProvider(network: Network = NETWORK): ElectrumNetworkProvider {
  if (cachedProvider) return cachedProvider;

  const servers = getServerList();
  if (!servers.length) {
    cachedProvider = new ElectrumNetworkProvider(network);
    return cachedProvider;
  }

  // CashScript uses (1, 1) for chipnet — needs exactly 1 connection to be "ready".
  // maxConnections = servers.length would require ALL servers to connect before ready().
  const cluster = new ElectrumCluster(
    'Bazaar',
    '1.4.1', // chipnet Fulcrum servers speak protocol 1.4.1
    1,       // minConnections (confidence) = 1 ready server needed
    1,       // maxConnections (distribution) = 1 connection maintained
    ClusterOrder.PRIORITY,
    DEFAULT_TIMEOUT,
    DEFAULT_PING_INTERVAL
  );

  for (const server of servers) {
    void cluster.addServer(server.host, server.port, server.scheme).catch(() => {
      // Ignore bad servers to allow other hosts to succeed.
    });
  }

  // manualConnectionManagement = true: prevents per-request connect/disconnect.
  // Without this, every getUtxos() call disconnects and reconnects (30s overhead each time).
  cachedProvider = new ElectrumNetworkProvider(network, cluster, true);
  // Pre-connect the cluster once so it's ready for all subsequent requests.
  void cachedProvider.connectCluster();
  return cachedProvider;
}
