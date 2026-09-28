#!/usr/bin/env python3
"""Build local CJK WOFF2 shards from pinned official font archives.

Run by tools/fonts.py, which passes the pinned archive it downloaded; the output goes to
src/generated/fonts/. Requires Python fontTools + Brotli + NumPy and 7z.
Uses the existing Noto Serif SC unicode partitions for common CJK characters;
remaining glyphs are emitted in disjoint groups, preserving source coverage.

Each CSS weight gets the static weight whose stems match the text beside it (see
tools/measure-font-weights.py). The UI reads a little heavier than Sarasa's own
weights, so 400 and 600 are Regular and SemiBold grown evenly by 6 and 5 units; Sarasa
has no medium, so its 500 is Regular grown by 16. Code sits inline at 0.944 em
(--mono-scale), where Maple's Light and Medium carry the text's stems.
"""
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import argparse
import re
import subprocess
import numpy as np
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/generated/fonts'
FONTS = {
    'sarasa': {'family':'Sarasa Gothic SC', 'prefix':'sarasa-sc', 'faces':{400:('SarasaGothicSC-Regular.ttf',6),500:('SarasaGothicSC-Regular.ttf',16),600:('SarasaGothicSC-SemiBold.ttf',5),700:('SarasaGothicSC-Bold.ttf',0)}},
    'maple': {'family':'Maple Mono NF CN', 'prefix':'maple-mono', 'faces':{400:('MapleMono-NF-CN-Light.ttf',0),600:('MapleMono-NF-CN-Medium.ttf',0)}},
}


def unicode_ranges(points):
    runs = []
    start = end = points[0]
    for point in points[1:]:
        if point == end + 1:
            end = point
        else:
            runs.append(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}')
            start = end = point
    runs.append(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}')
    return ','.join(runs)


def embolden(font, strength):
    """Grows every contour outward by strength/2 units along its miters, as FreeType's
    FT_Outline_EmboldenXY does, but in place: advances and the glyph's centre stay put."""
    glyf, hmtx = font['glyf'], font['hmtx']
    half = strength / 2
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.isComposite() or glyph.numberOfContours <= 0:
            continue
        points = np.array(glyph.coordinates, dtype=float)
        contours = np.split(points, np.array(glyph.endPtsOfContours[:-1]) + 1)
        area = sum(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]) for p in contours)
        # TrueType outlines run clockwise around ink; normals point out of it on that side.
        sign = 1.0 if area < 0 else -1.0
        grown = []
        for p in contours:
            before, after = p - np.roll(p, 1, axis=0), np.roll(p, -1, axis=0) - p
            lin, lout = np.hypot(*before.T), np.hypot(*after.T)
            with np.errstate(invalid='ignore', divide='ignore'):
                uin, uout = before / lin[:, None], after / lout[:, None]
                d = np.sum(uin * uout, axis=1)
                normals = sign * np.stack([-(uin[:, 1] + uout[:, 1]), uin[:, 0] + uout[:, 0]], axis=1)
                turn = sign * (uout[:, 0] * uin[:, 1] - uout[:, 1] * uin[:, 0])
                # a miter no longer than the shorter neighbouring segment keeps small details whole
                shift = normals * np.where(half * turn <= np.minimum(lin, lout) * (1 + d), half / (1 + d), np.minimum(lin, lout) / turn)[:, None]
            shift[(d <= -0.9375) | ~np.isfinite(shift).all(axis=1)] = 0
            grown.append(p + shift)
        glyph.coordinates = GlyphCoordinates([(int(round(x)), int(round(y))) for x, y in np.concatenate(grown)])
        glyph.recalcBounds(glyf)
        hmtx[name] = (hmtx[name][0], glyph.xMin)


def build(job):
    source, weight, index, points, out, family, prefix, key = job
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.flavor = 'woff2'
    options.recalc_timestamp = False
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=points)
    worker.subset(font)
    font.flavor = 'woff2'
    name = f'{prefix}-{weight}-{index}.woff2'
    font.save(Path(out) / name)
    font.close()
    ranges = unicode_ranges(points)
    return f"@font-face {{ font-family: '{family}'; font-style: normal; font-weight: {weight}; font-display: swap; src: url('./{key}/{name}') format('woff2'); unicode-range: {ranges}; }}\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('font', choices=FONTS)
    parser.add_argument('archive', type=Path, help='the pinned release archive (tools/fonts.json)')
    arguments = parser.parse_args()
    key, archive = arguments.font, arguments.archive
    config = FONTS[key]
    out = OUT / key
    out.mkdir(parents=True, exist_ok=True)

    destination = ROOT / '.cache/fonts' / (key+'-source')
    faces = config['faces']
    names = sorted({name for name, _ in faces.values()})
    subprocess.run(['7z', 'e', '-y', str(archive), '-o'+str(destination), *names], check=True, stdout=subprocess.DEVNULL)
    for stale in out.glob(f"{config['prefix']}-*.woff2"):
        stale.unlink()
    css = (ROOT / 'node_modules/@fontsource-variable/noto-serif-sc/index.css').read_text()
    partitions = []
    for value in re.findall(r'unicode-range:\s*([^;]+)', css):
        points = set()
        for item in value.split(','):
            limits = item.strip()[2:].split('-')
            points.update(range(int(limits[0],16),int(limits[-1],16)+1))
        partitions.append(points)
    jobs = []
    for weight, (name, grow) in faces.items():
        source = destination / name
        if grow:
            with TTFont(source) as font:
                embolden(font, grow)
                font['OS/2'].usWeightClass = weight
                source = destination / f'{source.stem}-{weight}.ttf'
                font.save(source)
        with TTFont(source) as font:
            remaining = set(font.getBestCmap())
        groups = []
        for partition in partitions:
            points = remaining & partition
            if points:
                groups.append(sorted(points))
                remaining -= points
        remainder = sorted(remaining)
        groups += [remainder[i:i+512] for i in range(0,len(remainder),512)]
        jobs.extend((str(source),weight,i,points,str(out),config['family'],config['prefix'],key) for i,points in enumerate(groups))
    with ProcessPoolExecutor(max_workers=6) as pool:
        rules = list(pool.map(build,jobs))
    (OUT/f'{key}.css').write_text('/* Generated by tools/build-cjk-fonts.py; OFL notice in public/licenses. */\n'+''.join(rules))
    print(f'Built {len(jobs)} disjoint WOFF2 shards ({sum(p.stat().st_size for p in out.glob("*.woff2"))} bytes).')

if __name__ == '__main__':
    main()
