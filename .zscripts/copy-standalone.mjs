import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const standalone = join(".next", "standalone");

if (existsSync(standalone)) {
  mkdirSync(join(standalone, ".next"), { recursive: true });
  cpSync(join(".next", "static"), join(standalone, ".next", "static"), {
    recursive: true,
    force: true,
  });
  cpSync("public", join(standalone, "public"), {
    recursive: true,
    force: true,
  });
}
