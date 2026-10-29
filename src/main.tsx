import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { render, Box, Text, useApp, useInput, useStdout } from "ink";
import {
  ContainerInfo,
  listContainers,
  fetchLogs,
  inspectContainer,
  killContainer,
  friendlyError,
  stopContainer,
  startContainer,
  deleteContainer,
  shortImage,
  primaryIp,
  memoryLabel,
  uptimeLabel,
} from "./container.js";

type View = "list" | "logs" | "inspect";

const POLL_MS = 2000;

function stateColor(state?: string): string {
  switch (state) {
    case "running":
      return "green";
    case "stopped":
      return "gray";
    case "stopping":
      return "yellow";
    default:
      return "white";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function pad(s: string, n: number): string {
  return truncate(s, n).padEnd(n, " ");
}

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<View>("list");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailText, setDetailText] = useState("");
  const [scroll, setScroll] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | { label: string; run: () => Promise<unknown> }>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const rows = stdout?.rows ?? 24;
  const cols = stdout?.columns ?? 80;
  const bodyHeight = Math.max(4, rows - 6); // header + footer chrome

  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listContainers();
      list.sort((a, b) => {
        const ra = a.status?.state === "running" ? 0 : 1;
        const rb = b.status?.state === "running" ? 0 : 1;
        return ra - rb || a.id.localeCompare(b.id);
      });
      setContainers(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Poll container list
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Keep selection in bounds
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, containers.length - 1)));
  }, [containers.length]);

  // Drop marks for containers that no longer exist
  useEffect(() => {
    setMarked((m) => {
      const ids = new Set(containers.map((c) => c.id));
      const next = new Set([...m].filter((id) => ids.has(id)));
      return next.size === m.size ? m : next;
    });
  }, [containers]);

  // Poll logs while in logs view
  useEffect(() => {
    if (view !== "logs" || !detailId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const text = await fetchLogs(detailId, 1000);
        if (!cancelled) setDetailText(text);
      } catch (e) {
        if (!cancelled) setDetailText(`(error fetching logs)\n${(e as Error).message}`);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [view, detailId]);

  const current = containers[selected];

  const openLogs = useCallback(() => {
    if (!current) return;
    setDetailId(current.id);
    setDetailText("Loading logs…");
    setScroll(-1); // -1 = follow tail
    setView("logs");
  }, [current]);

  const openInspect = useCallback(async () => {
    if (!current) return;
    setDetailId(current.id);
    setDetailText("Loading…");
    setScroll(0);
    setView("inspect");
    try {
      setDetailText(await inspectContainer(current.id));
    } catch (e) {
      setDetailText(`(error)\n${(e as Error).message}`);
    }
  }, [current]);

  const doAction = useCallback(
    (label: string, fn: (id: string) => Promise<unknown>) => {
      if (!current || busy) return;
      const id = current.id;
      setBusy(true);
      fn(id)
        .then(() => showFlash(`${label} ${id} ✓`))
        .catch((e) => showFlash(`${label} ${id} failed: ${friendlyError(e)}`))
        .finally(() => {
          setBusy(false);
          refresh();
        });
    },
    [current, busy, refresh, showFlash],
  );

  useInput((input, key) => {
    // Confirmation prompt intercepts everything
    if (confirmAction) {
      if (input === "y" || input === "Y") {
        const a = confirmAction;
        setConfirmAction(null);
        setBusy(true);
        a.run()
          .then(() => showFlash(`${a.label} ✓`))
          .catch((e) => showFlash(`${a.label} failed: ${friendlyError(e)}`))
          .finally(() => {
            setBusy(false);
            refresh();
          });
      } else {
        setConfirmAction(null);
      }
      return;
    }

    if (view !== "list") {
      if (input === "q" || key.escape) {
        setView("list");
        setDetailText("");
        return;
      }
      const lines = detailText.split("\n").length;
      const page = bodyHeight - 1;
      if (key.upArrow || input === "k") setScroll((s) => Math.max(0, (s === -1 ? lines - page : s) - 1));
      if (key.downArrow || input === "j") setScroll((s) => (s === -1 ? -1 : Math.min(lines - page, s + 1)));
      if (key.pageUp) setScroll((s) => Math.max(0, (s === -1 ? lines - page : s) - page));
      if (key.pageDown) setScroll((s) => (s === -1 ? -1 : Math.min(lines - page, s + page)));
      if (input === "g") setScroll(0);
      if (input === "G" || input === "f") setScroll(-1); // follow tail
      return;
    }

    // List view
    if (input === "q") {
      exit();
      return;
    }
    if (key.upArrow || input === "k") setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow || input === "j") setSelected((s) => Math.min(containers.length - 1, s + 1));
    if (input === "l") openLogs();
    if (input === "i" || key.return) openInspect();
    if (input === "r") refresh();

    if (input === " " && current && current.status?.state !== "running") {
      setMarked((m) => {
        const next = new Set(m);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      setSelected((s) => Math.min(containers.length - 1, s + 1));
      return;
    }

    if (input === "d" && !busy) {
      const byId = new Map(containers.map((c) => [c.id, c]));
      const targets =
        marked.size > 0
          ? [...marked].filter((id) => byId.get(id)?.status?.state !== "running")
          : current && current.status?.state !== "running"
            ? [current.id]
            : [];
      if (targets.length === 0) return;
      setBusy(true);
      Promise.allSettled(targets.map((id) => deleteContainer(id)))
        .then((results) => {
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed === 0) {
            showFlash(targets.length === 1 ? `delete ${targets[0]} ✓` : `deleted ${targets.length} containers ✓`);
          } else {
            const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
            showFlash(`delete failed for ${failed}/${targets.length}: ${friendlyError(firstErr.reason)}`);
          }
        })
        .finally(() => {
          setMarked(new Set());
          setBusy(false);
          refresh();
        });
      return;
    }

    if (current) {
      const state = current.status?.state;
      if (input === "x" && state === "running") {
        setConfirmAction({ label: `kill ${current.id}`, run: () => killContainer(current.id) });
      }
      if (input === "s" && state === "running") {
        doAction("stop", stopContainer);
      }
      if (input === "u" && state !== "running") {
        doAction("start", startContainer);
      }
    }
  });

  // ---- Rendering ----

  const idW = Math.max(8, Math.min(20, ...[12]));
  const nameW = Math.max(10, Math.min(24, Math.floor(cols * 0.2)));
  const imageW = Math.max(14, Math.floor(cols * 0.28));
  const header = useMemo(
    () =>
      `  ${pad("ID", nameW)} ${pad("IMAGE", imageW)} ${pad("STATE", 9)} ${pad("IP", 15)} ${pad("CPU", 4)} ${pad("MEM", 6)} ${pad("UP", 8)}`,
    [nameW, imageW],
  );

  if (view !== "list") {
    const lines = detailText.split("\n");
    const page = bodyHeight;
    const start = scroll === -1 ? Math.max(0, lines.length - page) : Math.min(scroll, Math.max(0, lines.length - page));
    const visible = lines.slice(start, start + page);
    const following = scroll === -1 && view === "logs";
    return (
      <Box flexDirection="column" height={rows - 1}>
        <Box>
          <Text bold color="cyan">
            {view === "logs" ? " Logs" : " Inspect"}: {detailId}
          </Text>
          {following && <Text color="green"> (following)</Text>}
          <Text dimColor>
            {"  "}[{start + 1}-{Math.min(start + page, lines.length)}/{lines.length}]
          </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
          {visible.map((line, i) => (
            <Text key={start + i} wrap="truncate-end">
              {line || " "}
            </Text>
          ))}
        </Box>
        <Text dimColor> ↑/↓ scroll · PgUp/PgDn page · g top · G/f follow tail · q/esc back</Text>
      </Box>
    );
  }

  const listStart = Math.max(0, Math.min(selected - bodyHeight + 2, containers.length - bodyHeight));
  const visibleContainers = containers.slice(listStart, listStart + bodyHeight);
  const runningCount = containers.filter((c) => c.status?.state === "running").length;

  return (
    <Box flexDirection="column" height={rows - 1}>
      <Box>
        <Text bold color="cyan">
          {" "}
          apple containers{" "}
        </Text>
        <Text dimColor>
          {runningCount} running / {containers.length} total
        </Text>
        {busy && <Text color="yellow"> ⏳ working…</Text>}
      </Box>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray">
        <Text bold dimColor wrap="truncate-end">
          {header}
        </Text>
        {!loaded && <Text dimColor> loading…</Text>}
        {loaded && containers.length === 0 && !error && (
          <Text dimColor> No containers. Try: container run -d --name web nginx</Text>
        )}
        {visibleContainers.map((c, i) => {
          const idx = listStart + i;
          const isSel = idx === selected;
          const isMarked = marked.has(c.id);
          const state = c.status?.state ?? "?";
          const cmd = "";
          const row = `${pad(c.id, nameW)} ${pad(shortImage(c.configuration.image?.reference), imageW)} ${pad(
            state,
            9,
          )} ${pad(primaryIp(c), 15)} ${pad(String(c.configuration.resources?.cpus ?? "-"), 4)} ${pad(
            memoryLabel(c.configuration.resources?.memoryInBytes),
            6,
          )} ${pad(uptimeLabel(c), 8)}${cmd}`;
          return (
            <Text key={c.id} wrap="truncate-end" inverse={isSel}>
              <Text color={isSel ? undefined : isMarked ? "magenta" : "cyan"}>
                {isMarked ? "✔" : isSel ? "▶" : " "}{" "}
              </Text>
              <Text color={isSel ? undefined : isMarked ? "magenta" : stateColor(state)}>{row}</Text>
            </Text>
          );
        })}
      </Box>
      {confirmAction ? (
        <Text color="red" bold>
          {" "}
          Confirm {confirmAction.label}? (y/N)
        </Text>
      ) : error ? (
        <Text color="red" wrap="truncate-end">
          {" "}
          {truncate(error.replace(/\n/g, " "), cols - 2)}
        </Text>
      ) : flash ? (
        <Text color="yellow"> {flash}</Text>
      ) : (
        <Text dimColor>
          {" "}
          ↑/↓ select · ⏎/i inspect · l logs · s stop · x kill · u start · ␣ mark · d delete{marked.size > 0 ? ` (${marked.size})` : ""} · r refresh · q quit
        </Text>
      )}
    </Box>
  );
}

render(<App />, { exitOnCtrlC: true });
