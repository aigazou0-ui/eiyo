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

You can also point the server to another executable or eval directory:

```powershell
$env:YANEURAOU_PATH="C:\path\to\YaneuraOu.exe"
$env:YANEURAOU_EVAL_DIR="C:\path\to\eval"
npm start
```

Render uses the same server through `render.yaml`.

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
