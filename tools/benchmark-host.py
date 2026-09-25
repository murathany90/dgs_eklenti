"""Measure local framed native-host transfer, conversion, solve and serialization."""
import argparse
import base64
import hashlib
import io
import json
import time
from ytbs_solver_host.main import serve
from ytbs_solver_host.network_mapper import convert
from ytbs_solver_host.pandapower_adapter import run
from ytbs_solver_host.protocol import read_message, write_message

parser = argparse.ArgumentParser()
parser.add_argument("canonical_json")
parser.add_argument("--solve", choices=["AC", "DC"])
args = parser.parse_args()
data = open(args.canonical_json, "rb").read()
input_stream, output_stream = io.BytesIO(), io.BytesIO()

def send(kind, **fields):
    write_message({"type": kind, "protocolVersion": "1.0", "requestId": "benchmark", "jobId": "benchmark", **fields}, input_stream)

send("CREATE_MODEL", byteLength=len(data), sha256=hashlib.sha256(data).hexdigest())
for index, offset in enumerate(range(0, len(data), 128 * 1024)):
    send("MODEL_CHUNK", index=index, data=base64.b64encode(data[offset:offset + 128 * 1024]).decode("ascii"))
send("MODEL_COMPLETE")
input_stream.seek(0)
started = time.perf_counter()
serve(input_stream, output_stream)
transfer_ms = (time.perf_counter() - started) * 1000
output_stream.seek(0)
responses = []
while response := read_message(output_stream): responses.append(response)
if any(response["type"] == "ERROR" for response in responses):
    raise RuntimeError(next(response for response in responses if response["type"] == "ERROR"))
model = json.loads(data)
started = time.perf_counter()
_, _, unsupported, conversion_ms = convert(model)
result = {"transferMs": transfer_ms, "conversionMs": conversion_ms, "unsupported": len(unsupported), "bytes": len(data)}
if args.solve:
    solved = run(model, args.solve)
    started = time.perf_counter()
    result_bytes = json.dumps(solved, separators=(",", ":"), allow_nan=False).encode("utf-8")
    result.update({"mode": args.solve, "convergence": solved["convergence"], "validation": solved["validation"],
                   "solveMs": solved["performance"]["solveMs"], "serializationMs": (time.perf_counter() - started) * 1000,
                   "resultBytes": len(result_bytes)})
print(json.dumps(result))
