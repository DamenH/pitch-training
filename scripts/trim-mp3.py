#!/usr/bin/env python3
"""Losslessly shorten MPEG-1 Layer III files by cutting at a frame boundary.

Used once to trim the bundled piano samples: the app never sounds a note for
more than ~4.3 s, and full-length decays (up to 25 s) would waste download size
and, after decoding, a lot of memory on phones. No re-encoding takes place.

Also drops ID3 tags and the Xing/Info header frame, whose frame count would no
longer match the shortened stream.

Usage: python3 scripts/trim-mp3.py SECONDS FILE.mp3 [FILE.mp3 ...]
"""
import sys

BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
RATES = [44100, 48000, 32000, 0]


def trim(path: str, seconds: float) -> None:
    data = open(path, 'rb').read()
    pos = 0
    if data[:3] == b'ID3':
        size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]
        pos = 10 + size
    out = bytearray()
    samples = 0
    first = True
    while pos + 4 <= len(data):
        h = data[pos:pos + 4]
        if h[0] != 0xFF or (h[1] & 0xFE) != 0xFA:  # MPEG-1, Layer III sync
            raise ValueError(f'{path}: lost frame sync at byte {pos}')
        bitrate = BITRATES[h[2] >> 4] * 1000
        rate = RATES[(h[2] >> 2) & 3]
        padding = (h[2] >> 1) & 1
        if not bitrate or not rate:
            raise ValueError(f'{path}: unsupported frame header at byte {pos}')
        length = 144 * bitrate // rate + padding
        frame = data[pos:pos + length]
        if first and (b'Xing' in frame[:64] or b'Info' in frame[:64]):
            pass  # drop the VBR/Info header frame
        else:
            out += frame
            samples += 1152
        first = False
        pos += length
        if samples / rate >= seconds:
            break
    open(path, 'wb').write(out)
    print(f'{path}: {samples / rate:.2f} s, {len(out) // 1024} KiB')


if __name__ == '__main__':
    secs = float(sys.argv[1])
    for p in sys.argv[2:]:
        trim(p, secs)
