import { execFile } from "node:child_process";

export interface ContainerNetworkStatus {
  hostname?: string;
  ipv4Address?: string;
  ipv4Gateway?: string;
  macAddress?: string;
  network?: string;
}

export interface ContainerInfo {
  id: string;
  configuration: {
    creationDate?: string;
    image?: { reference?: string };
    initProcess?: { arguments?: string[]; executable?: string };
    labels?: Record<string, string>;
    platform?: { architecture?: string; os?: string };
    publishedPorts?: unknown[];
    resources?: { cpus?: number; memoryInBytes?: number };
    mounts?: unknown[];
  };
  status?: {
    state?: string;
    startedDate?: string;
    networks?: ContainerNetworkStatus[];
  };
}

function run(args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "container",
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve(stdout);
      },
    );
  });
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const out = await run(["list", "--all", "--format", "json"]);
  return JSON.parse(out || "[]") as ContainerInfo[];
}

export async function fetchLogs(id: string, lines = 500): Promise<string> {
  return run(["logs", "-n", String(lines), id]);
}

export async function inspectContainer(id: string): Promise<string> {
  const out = await run(["inspect", id]);
  // Pretty-print
  try {
    return JSON.stringify(JSON.parse(out), null, 2);
  } catch {
    return out;
  }
}

export async function killContainer(id: string): Promise<string> {
  try {
    return await run(["kill", id]);
  } catch (e) {
    // Container already exited between confirm prompt and kill — goal achieved.
    if (/not running/i.test((e as Error).message)) return "";
    throw e;
  }
}
export const stopContainer = (id: string) => run(["stop", id], 30_000);
export const startContainer = (id: string) => run(["start", id], 60_000);
export const deleteContainer = (id: string) => run(["delete", id]);

// The container CLI nests errors like:
//   internalError: "failed to kill" (cause: "invalidState: "cannot kill: ..."")
// Extract the innermost cause for readable messages.
export function friendlyError(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  const causes = [...msg.matchAll(/\(cause:\s*"(?:\w+:\s*)?"?([^"]+)"?"?\)/g)];
  if (causes.length > 0) msg = causes[causes.length - 1][1];
  return msg.replace(/^Error:\s*/, "").replace(/^\w+:\s*"?/, "").replace(/"+$/, "").trim() || "unknown error";
}

export function shortImage(ref?: string): string {
  if (!ref) return "-";
  return ref.replace(/^docker\.io\/library\//, "").replace(/^docker\.io\//, "");
}

export function primaryIp(c: ContainerInfo): string {
  const net = c.status?.networks?.[0];
  if (!net?.ipv4Address) return "-";
  return net.ipv4Address.replace(/\/\d+$/, "");
}

export function memoryLabel(bytes?: number): string {
  if (!bytes) return "-";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb % 1 === 0 ? gb : gb.toFixed(1)}G` : `${Math.round(bytes / 1024 ** 2)}M`;
}

export function uptimeLabel(c: ContainerInfo): string {
  if (c.status?.state !== "running" || !c.status.startedDate) return "-";
  const ms = Date.now() - new Date(c.status.startedDate).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}m`;
  return `${Math.floor(h / 24)}d${h % 24}h`;
}
