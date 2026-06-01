# Engine files for local and Render testing

Place the Windows YaneuraOu executable here for local PC tests:

```text
engine/yaneuraou.exe
```

Place the Linux YaneuraOu executable here for Render:

```text
engine/yaneuraou
```

Place the Suisho-style NNUE evaluation file here:

```text
engine/eval/nn.bin
```

On Render, you can also set this environment variable to a direct `nn.bin` URL or the official `Suisho5.7z` release asset:

```text
NNUE_EVAL_URL=https://github.com/yaneurao/YaneuraOu/releases/download/suisho5/Suisho5.7z
```

The server downloads and extracts it at startup if `engine/eval/nn.bin` is missing.

You can also point the server to another executable or eval directory:

```powershell
$env:YANEURAOU_PATH="C:\path\to\YaneuraOu.exe"
$env:YANEURAOU_EVAL_DIR="C:\path\to\eval"
npm start
```

Render uses Docker through `render.yaml`. During the Docker build, `scripts/build-yaneuraou.sh` clones the official YaneuraOu repository and builds a Linux binary at:

```text
engine/yaneuraou
```

The default build target is `TARGET_CPU=SSE42` for safer Render compatibility. If Render's CPU supports AVX2 and the service is stable, it can be changed later for speed.

Important endpoints:

```text
GET  /health
POST /bestmove
```

Example `/bestmove` body:

```json
{
  "sfen": "lnsgkgsnl/1r5b1/p1ppppppp/9/9/9/P1PPPPPPP/1B5R1/LNSGKGSNL b - 1",
  "level": "normal",
  "purpose": "cpu",
  "side": "w",
  "ply": 1,
  "requestId": "test-1"
}
```

Windows engine binaries are for local PC tests only. Render needs the Linux binary.
