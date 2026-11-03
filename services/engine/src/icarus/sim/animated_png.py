"""Animated PNG from same-sized PNG frames, written with the standard library: any browser plays it."""

import struct
import zlib

_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _chunks(png: bytes) -> list[tuple[bytes, bytes]]:
    if not png.startswith(_SIGNATURE):
        raise ValueError("A frame is not a PNG")
    found, at = [], len(_SIGNATURE)
    while at < len(png):
        (length,) = struct.unpack(">I", png[at : at + 4])
        found.append((png[at + 4 : at + 8], png[at + 8 : at + 8 + length]))
        at += 12 + length
    return found


def animated_png(frames: list[bytes], delay_ms: int, loops: int = 0) -> bytes:
    """Frames shown `delay_ms` apart, looping `loops` times (0 forever)."""
    if not frames:
        raise ValueError("An animation needs at least one frame")
    header = next(data for tag, data in _chunks(frames[0]) if tag == b"IHDR")
    width, height = struct.unpack(">II", header[:8])
    out = [_SIGNATURE, _chunk(b"IHDR", header), _chunk(b"acTL", struct.pack(">II", len(frames), loops))]
    sequence = 0
    for index, frame in enumerate(frames):
        chunks = _chunks(frame)
        if next(data for tag, data in chunks if tag == b"IHDR") != header:
            raise ValueError("Every frame must have the same size and format")
        control = struct.pack(">IIIIIHHBB", sequence, width, height, 0, 0, delay_ms, 1000, 0, 0)
        out.append(_chunk(b"fcTL", control))
        sequence += 1
        data = b"".join(payload for tag, payload in chunks if tag == b"IDAT")
        if index == 0:
            out.append(_chunk(b"IDAT", data))
        else:
            out.append(_chunk(b"fdAT", struct.pack(">I", sequence) + data))
            sequence += 1
    out.append(_chunk(b"IEND", b""))
    return b"".join(out)
