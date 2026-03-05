import { spawn } from "node:child_process";

function main() {
  const forwardedArgs = process.argv.slice(2);
  const child = spawn(process.execPath, ["scripts/test-runner.js", ...forwardedArgs], {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("close", (code) => {
    process.exit(code || 0);
  });
}

main();
