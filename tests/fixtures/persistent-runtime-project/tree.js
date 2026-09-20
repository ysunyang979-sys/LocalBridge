import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(__dirname, "child.js")], {
  stdio: "inherit",
});

console.log(`Parent started child PID: ${child.pid}`);

setInterval(() => {
  console.log("Parent tick");
}, 100);
