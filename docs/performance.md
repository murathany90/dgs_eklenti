# v6.1 performance measurements

Local Windows/Python 3.12/Node 22 measurements on 2026-09-25. Command: `node --max-old-space-size=8192 --import tsx tools/benchmark-electrical.mjs <files>`. Values below are single-run elapsed times, not acceptance thresholds. Peak RSS is measured after mapping/serialization and is not a sampled true peak. Full DGS files exist only locally.

| Source | Bytes | Read ms | SHA-256 ms | JSON parse ms | Electrical map ms | Compact serialize ms | Compact bytes | RSS observed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| smoke excerpt | 33,734 | 1.43 | 0.07 | 0.36 | 1.86 | 0.18 | 38,129 | 80 MB |
| 20260923 12:00 | 143,026,320 | 62.65 | 83.97 | 576.49 | 703.40 | 184.40 | 34,568,535 | 713 MB |
| 20260925 10:00 | 143,003,403 | 106.85 | 83.86 | 570.89 | 1,093.35 | 350.25 | 34,574,927 | 626 MB |

The worker reads the File once, hashes the buffer once, parses once, maps and posts phase progress (`READING`, `HASHING`, `PARSING`, `MAPPING`, `VALIDATING`, `READY`). It transfers a compact electrical model alongside the one raw structured clone still required by the v5.5 UI. The full model in-memory and Chrome browser time can exceed the Node benchmark.

The local framed host path was measured with `PYTHONPATH=native-host/python python tools/benchmark-host.py .v61-full-electrical.json --solve AC|DC`. Transfer here is in-process frame/base64 decode and JSON validation, not Chrome IPC. A separate Windows Chromium E2E exercised actual Native Messaging with the full 12:00 file and both AC/DC.

| 12:00 full canonical (34,568,488 bytes) | Frame transfer ms | Conversion ms | Solve ms | Serialization ms | Result bytes | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| AC | 570 | 3,075 | 6,293 | 4 | 594,299 | NON_CONVERGED after 30 NR iterations |
| DC | 593 | 3,106 | 1,462 | 322 | 12,112,360 | CONVERGED / PARTIAL |

The separate full-model runs reported 12:00 AC `NON_CONVERGED`, DC `CONVERGED/PARTIAL`; 10:00 AC `NON_CONVERGED`, DC `CONVERGED/PARTIAL`. Both models retain all ~86,000 buses and ~95,000 switches in the conversion. The 5,032/5,024 unsupported records chiefly reflect absent transformer phase shifts, missing PV Q limits and equivalent line sections. DC convergence cannot validate AC voltage or reactive power.
