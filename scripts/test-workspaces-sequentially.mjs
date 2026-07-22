import { spawnSync } from "node:child_process";

const query = spawnSync("npm", ["query", ".workspace"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

if (query.status !== 0) {
  process.exit(query.status ?? 1);
}

const workspaces = JSON.parse(query.stdout)
  .filter((item) => item.package?.scripts?.test)
  .map((item) => item.location);

for (const workspace of workspaces) {
  console.log(`::group::${workspace}`);
  const result = spawnSync(
    "npm",
    ["test", "--workspace", workspace, "--if-present"],
    { stdio: "inherit" },
  );
  console.log("::endgroup::");

  if (result.status !== 0) {
    console.error(`Workspace test failed: ${workspace}`);
    process.exit(result.status ?? 1);
  }
}
