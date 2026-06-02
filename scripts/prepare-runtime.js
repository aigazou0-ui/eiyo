const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const evalDir = process.env.YANEURAOU_EVAL_DIR || path.join(__dirname, "..", "engine", "eval");
const evalPath = path.join(evalDir, "nn.bin");
const evalUrl = process.env.NNUE_EVAL_URL || "";

function findFile(root, fileName) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const found = findFile(fullPath, fileName);
      if (found) return found;
    }
  }
  return "";
}

async function main() {
  if (fs.existsSync(evalPath)) return;
  if (!evalUrl) {
    console.warn(`NNUE eval file is missing: ${evalPath}`);
    console.warn("Set NNUE_EVAL_URL to download nn.bin at service startup, or place engine/eval/nn.bin manually.");
    return;
  }

  fs.mkdirSync(evalDir, { recursive: true });
  const isArchive = /\.(?:7z|zip)(?:$|\?)/i.test(evalUrl);
  const archiveName = path.basename(new URL(evalUrl).pathname) || "eval.archive";
  const downloadPath = isArchive ? path.join(evalDir, archiveName) : evalPath;
  console.log(`Downloading NNUE eval file from ${evalUrl}`);
  const response = await fetch(evalUrl);
  if (!response.ok) throw new Error(`Failed to download NNUE eval file: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(downloadPath, buffer);

  if (isArchive) {
    console.log(`Extracting NNUE archive: ${downloadPath}`);
    execFileSync("7z", ["x", downloadPath, `-o${evalDir}`, "-y"], { stdio: "inherit" });
    if (!fs.existsSync(evalPath)) {
      const extractedEval = findFile(evalDir, "nn.bin");
      if (!extractedEval) throw new Error(`Archive extracted, but nn.bin was not found under: ${evalDir}`);
      fs.copyFileSync(extractedEval, evalPath);
    }
    fs.rmSync(downloadPath, { force: true });
  }

  const stat = fs.statSync(evalPath);
  console.log(`Saved NNUE eval file: ${evalPath} (${stat.size} bytes)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
