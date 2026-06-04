#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const FILES = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const RANKS = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
const CSA_TO_USI_PIECE = {
  FU: "P",
  KY: "L",
  KE: "N",
  GI: "S",
  KI: "G",
  KA: "B",
  HI: "R",
  OU: "K",
  TO: "P",
  NY: "L",
  NK: "N",
  NG: "S",
  UM: "B",
  RY: "R"
};
const PROMOTED_CSA = new Set(["TO", "NY", "NK", "NG", "UM", "RY"]);

function usage() {
  console.log([
    "Usage: node tools/build-opening-book.js --input <file-or-dir> --output js/opening-book.js [options]",
    "",
    "Options:",
    "  --max-ply <n>       Plies to keep, default 30",
    "  --min-count <n>     Minimum move frequency per position, default 2",
    "  --top <n>           Candidate moves per position, default 4",
    "  --id <name>         Book id, default external-opening-pack",
    "",
    "Inputs:",
    "  .txt/.usi: one game per line, either USI moves or 'position startpos moves ...'",
    "  .json: array of move arrays, or objects with a moves array",
    "  .csa: CSA move lines such as +7776FU / -3334FU"
  ].join("\n"));
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function allInputFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  return fs.readdirSync(inputPath, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(inputPath, entry.name);
    if (entry.isDirectory()) return allInputFiles(full);
    return entry.isFile() ? [full] : [];
  });
}

function isUsiMove(text) {
  if (!text || typeof text !== "string") return false;
  if (/^[PLNSGBR]\*[1-9][a-i]$/.test(text)) return true;
  if (!/^[1-9][a-i][1-9][a-i]\+?$/.test(text)) return false;
  return FILES.has(text[0]) && RANKS.has(text[1]) && FILES.has(text[2]) && RANKS.has(text[3]);
}

function parseUsiLine(line) {
  const clean = line.trim();
  if (!clean || clean.startsWith("#")) return [];
  const tokens = clean.includes(" moves ") ? clean.split(/\s+moves\s+/).pop().trim().split(/\s+/) : clean.split(/\s+/);
  return tokens.filter(isUsiMove);
}

function csaSquare(file, rank) {
  const ranks = "abcdefghi";
  return `${file}${ranks[Number(rank) - 1]}`;
}

function parseCsaMove(line) {
  const match = /^[-+](\d)(\d)(\d)(\d)([A-Z]{2})/.exec(line.trim());
  if (!match) return null;
  const [, fromFile, fromRank, toFile, toRank, csaPiece] = match;
  const piece = CSA_TO_USI_PIECE[csaPiece];
  if (!piece) return null;
  const to = csaSquare(toFile, toRank);
  if (fromFile === "0" && fromRank === "0") return `${piece}*${to}`;
  const from = csaSquare(fromFile, fromRank);
  const promote = PROMOTED_CSA.has(csaPiece) && piece !== "G" && piece !== "K" ? "+" : "";
  return `${from}${to}${promote}`;
}

function parseFile(file) {
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, "utf8");
  if (ext === ".json") {
    const raw = JSON.parse(text);
    const games = Array.isArray(raw) ? raw : raw.games;
    if (!Array.isArray(games)) return [];
    return games.map(game => {
      const moves = Array.isArray(game) ? game : game && game.moves;
      return Array.isArray(moves) ? moves.filter(isUsiMove) : [];
    }).filter(game => game.length);
  }
  if (ext === ".csa") {
    const moves = text.split(/\r?\n/).map(parseCsaMove).filter(Boolean);
    return moves.length ? [moves] : [];
  }
  return text.split(/\r?\n/).map(parseUsiLine).filter(game => game.length);
}

function isBadEarlyMove(usi, ply) {
  if (ply < 30 && /^[BR]\*/.test(usi)) return true;
  if (ply < 24 && /^[PLNSGBR]\*/.test(usi)) return true;
  if (ply < 72 && (usi === "2c2d" || usi === "8g8f")) return true;
  return false;
}

function addCandidate(map, prefixMoves, usi, ply) {
  if (isBadEarlyMove(usi, ply)) return;
  const prefix = prefixMoves.join(" ");
  if (!map.has(prefix)) map.set(prefix, new Map());
  const moves = map.get(prefix);
  moves.set(usi, (moves.get(usi) || 0) + 1);
}

function buildBook(games, options) {
  const positions = new Map();
  for (const game of games) {
    const kept = game.slice(0, options.maxPly);
    for (let ply = 0; ply < kept.length; ply += 1) {
      addCandidate(positions, kept.slice(0, ply), kept[ply], ply);
    }
  }
  const entries = [];
  for (const [prefix, moves] of positions.entries()) {
    const candidates = Array.from(moves.entries())
      .filter(([, count]) => count >= options.minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, options.top)
      .map(([usi, count]) => ({ usi, count, weight: Number((count / Math.max(1, games.length)).toFixed(3)) }));
    if (candidates.length) entries.push({ id: `pos-${entries.length + 1}`, prefix, tags: [], moves: candidates });
  }
  return {
    id: options.id,
    version: 1,
    maxPly: options.maxPly,
    entries
  };
}

function writeJs(output, book) {
  const body = `(function () {\n  window.ShogiOpeningBook = ${JSON.stringify(book, null, 2)};\n})();\n`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, body, "utf8");
}

const input = argValue("--input");
const output = argValue("--output", path.join("js", "opening-book.js"));
if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}
if (!input) {
  usage();
  process.exit(1);
}

const options = {
  id: argValue("--id", "external-opening-pack"),
  maxPly: Number(argValue("--max-ply", "30")),
  minCount: Number(argValue("--min-count", "2")),
  top: Number(argValue("--top", "4"))
};
const files = allInputFiles(path.resolve(input));
const games = files.flatMap(parseFile).filter(game => game.length);
const book = buildBook(games, options);
writeJs(path.resolve(output), book);
console.log(JSON.stringify({ files: files.length, games: games.length, entries: book.entries.length, output }, null, 2));
