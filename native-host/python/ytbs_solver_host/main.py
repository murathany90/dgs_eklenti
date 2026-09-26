"""Chrome Native Messaging host; fixed commands and bounded in-memory transfer."""
import base64
import hashlib
import json
import sys
import time
import uuid
from . import PROTOCOL_VERSION
from .protocol import read_message, write_message

MAX_MODEL_BYTES = 128 * 1024 * 1024
RESULT_CHUNK_BYTES = 192 * 1024


def serve(reader=None, writer=None, announce_start=False):
    reader = reader or sys.stdin.buffer
    writer = writer or sys.stdout.buffer
    if announce_start:
        write_message({"type": "HOST_STARTED", "protocolVersion": PROTOCOL_VERSION, "requestId": "", "jobId": ""}, writer)
    job = None
    while True:
        base = None
        try:
            msg = read_message(reader)
            if msg is None:
                return
            kind = msg.get("type")
            request_id, job_id = msg.get("requestId"), msg.get("jobId")
            if not isinstance(request_id, str) or not request_id or len(request_id) > 100 or not isinstance(job_id, str) or not job_id or len(job_id) > 100:
                raise ValueError("requestId and jobId required")
            base = {"protocolVersion": PROTOCOL_VERSION, "requestId": request_id, "jobId": job_id}
            def send(response_type, **fields):
                write_message({**base, "type": response_type, **fields}, writer)
            if msg.get("protocolVersion") != PROTOCOL_VERSION:
                send("ERROR", code="PROTOCOL_VERSION", message="unsupported protocol version")
                continue
            if kind in ("HELLO", "CAPABILITIES"):
                send("HELLO_ACK")
                try:
                    engine_version = __import__("pandapower").__version__
                except ImportError as exc:
                    send("ERROR", code="PANDAPOWER_IMPORT_ERROR", message=str(exc)[:300])
                    continue
                send("CAPABILITIES", engine="pandapower", engineVersion=engine_version, ac=True, dc=True,
                     maxModelBytes=MAX_MODEL_BYTES, chunkBytes=RESULT_CHUNK_BYTES)
            elif kind == "PING":
                send("PONG")
            elif kind == "CREATE_MODEL":
                expected = msg.get("byteLength")
                if not isinstance(expected, int) or expected < 2 or expected > MAX_MODEL_BYTES or not isinstance(msg.get("sha256"), str) or len(msg["sha256"]) != 64 or any(char not in '0123456789abcdef' for char in msg["sha256"]):
                    raise ValueError("invalid model length or hash")
                job = {"id": job_id, "expected": expected, "hash": msg["sha256"], "bytes": bytearray(), "next": 0, "model": None}
                send("PROGRESS", phase="CREATE_MODEL", received=0)
            elif kind == "MODEL_CHUNK":
                if not job or job_id != job["id"] or msg.get("index") != job["next"] or not isinstance(msg.get("data"), str):
                    raise ValueError("unexpected model chunk")
                chunk = base64.b64decode(msg["data"], validate=True)
                if not chunk or len(chunk) > RESULT_CHUNK_BYTES or len(job["bytes"]) + len(chunk) > job["expected"]:
                    raise ValueError("invalid chunk size")
                job["bytes"].extend(chunk)
                job["next"] += 1
                send("PROGRESS", phase="MODEL_CHUNK", received=len(job["bytes"]))
            elif kind == "MODEL_COMPLETE":
                if not job or job_id != job["id"] or len(job["bytes"]) != job["expected"]:
                    raise ValueError("incomplete model")
                if hashlib.sha256(job["bytes"]).hexdigest() != job["hash"]:
                    raise ValueError("model SHA-256 mismatch")
                job["model"] = json.loads(job["bytes"])
                del job["bytes"]
                send("PROGRESS", phase="MODEL_READY")
            elif kind == "PREFLIGHT":
                from .network_mapper import prepare
                if not job or job_id != job["id"] or not isinstance(job.get("model"), dict):
                    raise ValueError("model not ready")
                send("PROGRESS", phase="AC_PREFLIGHT")
                job["prepared"], job["diagnostics"] = prepare(job["model"])
                send("DIAGNOSTICS", diagnostics=job["diagnostics"])
            elif kind == "RUN_LOAD_FLOW":
                from .pandapower_adapter import run
                if not job or job_id != job["id"] or not isinstance(job.get("model"), dict):
                    raise ValueError("model not ready")
                mode = msg.get("mode")
                if mode not in ("AC", "DC"):
                    raise ValueError("invalid load flow mode")
                send("PROGRESS", phase="CONVERTING")
                send("PROGRESS", phase=f"SOLVING_{mode}")
                result = run(job["model"], mode, job.get("prepared"), job.get("diagnostics"))
                send("PROGRESS", phase="SERIALIZING")
                started = time.perf_counter()
                payload = json.dumps(result, separators=(",", ":"), allow_nan=False).encode("utf-8")
                serial_ms = (time.perf_counter() - started) * 1000
                chunks = (len(payload) + RESULT_CHUNK_BYTES - 1) // RESULT_CHUNK_BYTES
                send("RESULT_SUMMARY", chunkCount=chunks, byteLength=len(payload), sha256=hashlib.sha256(payload).hexdigest(),
                     convergence=result["convergence"], validation=result["validation"], summary=result["summary"], diagnostics=result.get("preflight"),
                     performance={**result["performance"], "serializationMs": serial_ms})
                for index in range(chunks):
                    part = payload[index * RESULT_CHUNK_BYTES:(index + 1) * RESULT_CHUNK_BYTES]
                    send("RESULT_CHUNK", index=index, data=base64.b64encode(part).decode("ascii"))
                job = None
            elif kind == "CANCEL":
                job = None
                send("PROGRESS", phase="CANCELLED")
            else:
                send("ERROR", code="UNKNOWN_COMMAND", message="unsupported command")
        except Exception as exc:
            if base:
                write_message({**base, "type": "ERROR", "code": "HOST_ERROR", "message": str(exc)[:300]}, writer)
            else:
                return


def main():
    serve(announce_start=True)


if __name__ == "__main__":
    main()
