"""Genera le icone PNG dell'app (senza librerie esterne). Uso: python tools/make_icons.py"""
import os
import struct
import zlib

BG = (47, 111, 94)
WHITE = (255, 255, 255)
RED = (214, 69, 65)
GRID = (47, 111, 94)


def rounded_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def pixel(u, v):
    """u, v in [0,1]. Restituisce il colore del punto."""
    # corpo del calendario
    if rounded_rect(u, v, 0.18, 0.22, 0.82, 0.82, 0.07):
        if v < 0.38:
            return RED
        # griglia di giorni 4x3
        for row in range(3):
            for col in range(4):
                x0 = 0.25 + col * 0.13
                y0 = 0.45 + row * 0.11
                if x0 <= u <= x0 + 0.08 and y0 <= v <= y0 + 0.07:
                    return GRID
        return WHITE
    # anelli
    for cx in (0.35, 0.65):
        if rounded_rect(u, v, cx - 0.03, 0.15, cx + 0.03, 0.29, 0.03):
            return WHITE
    return BG


def make_png(size, path, ss=3):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            n = ss * ss
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size, name in ((180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        make_png(size, os.path.join(out, name))
        print("creata", name)
