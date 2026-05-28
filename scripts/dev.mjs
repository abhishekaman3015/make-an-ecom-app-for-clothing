import { spawn } from "node:child_process";

const processes = [
  ["api", "cd backend && go run ./cmd/api"],
  ["client", "npm.cmd run dev --prefix client"]
];

for (const [name, command] of processes) {
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", command], { shell: false })
    : spawn(command, { shell: true });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}
