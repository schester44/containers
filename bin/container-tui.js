#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tsx = join(root, "node_modules", ".bin", "tsx");
const child = spawn(tsx, [join(root, "src", "main.tsx")], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
