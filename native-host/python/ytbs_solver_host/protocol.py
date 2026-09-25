"""Length framed Chrome Native Messaging protocol. No executable input fields."""
import json
import struct
import sys

MAX_INBOUND = 2 * 1024 * 1024
MAX_OUTBOUND = 512 * 1024


def read_message(stream=None):
    stream = stream or sys.stdin.buffer
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError("truncated native message header")
    size = struct.unpack("<I", header)[0]
    if size < 2 or size > MAX_INBOUND:
        raise ValueError("native message size outside allowed range")
    data = stream.read(size)
    if len(data) != size:
        raise ValueError("truncated native message body")
    message = json.loads(data)
    if not isinstance(message, dict):
        raise ValueError("native message must be object")
    return message


def write_message(message, stream=None):
    stream = stream or sys.stdout.buffer
    data = json.dumps(message, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(data) > MAX_OUTBOUND:
        raise ValueError("native response exceeds chunk limit")
    stream.write(struct.pack("<I", len(data)))
    stream.write(data)
    stream.flush()
