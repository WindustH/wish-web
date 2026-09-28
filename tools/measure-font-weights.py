#!/usr/bin/env python3
"""Measure the stems of the fonts that share a line, as the app loads them.

Text mixes Montserrat (Latin) with Sarasa Gothic SC (Chinese), code in Maple Mono NF CN
sits inline at 0.944 em, and headings mix Bitter with Noto Serif SC. A CSS weight should
give each pair the same stroke. This prints, per CSS weight, the mean vertical stem (and
horizontal bar) in em of every face, and for each variable Latin font the wght whose stem
matches its partner: the calibration tools/build-latin-fonts.py applies.

Requires Python fontTools, Brotli, NumPy and Pillow, and ./pnpmw install.
"""
from functools import cache
from io import BytesIO
from pathlib import Path
import re
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONTSOURCE = ROOT / 'node_modules/@fontsource-variable'
PX = 480
LATIN = 'abcdefghijklmnopqrstuvwxyzaeinorstaeinost0123456789ABCDEHMNRST'
# Frequent Hanzi, and words from the interface.
HANZI = ('的一是不了人我在有这中大来上个到说们为子和你地出道也时年得就那要下以生会自着去过家学对可里后小么心多天而能好都然没日于起还发成事只作当想看文无开手用主行方又如前所本见经头面公同已从动两长知现分将外但身些与高意进把法此实回理点月明其种声全工己话者向情部正名定问力机给等几很业最间新什打便位因重被走电第门相次东再平真世气信关并内加化由却代入先山五太水万市眼体别处总才场书比住通目报立马命活难神数件安表原车白应路期死常提感金何更反合放做系计或司利受光王果亲界及今京务制解各任至清物台象记边共风'
         '测试会话设置最近服务与提供商账户状态统计全部搜索')
WEIGHTS = (400, 500, 600, 700)
MONO_SCALE = .944


def ranges(text):
    points = set()
    for item in text.split(','):
        limits = item.strip()[2:].split('-')
        points.update(range(int(limits[0], 16), int(limits[-1], 16) + 1))
    return points


def faces(css, base):
    """The @font-face rules of a stylesheet: (weight range, file, code points)."""
    found = []
    for block in re.findall(r'@font-face\s*\{(.*?)\}', css.read_text(), re.S):
        if 'italic' in re.search(r'font-style:\s*(\w+)', block).group(1):
            continue
        weight = [int(value) for value in re.search(r'font-weight:\s*([\d ]+)', block).group(1).split()]
        url = re.search(r"url\('?([^')]+)'?\)", block).group(1)
        found.append((weight, (base / url).resolve(), ranges(re.search(r'unicode-range:\s*([^;]+)', block).group(1))))
    return found


@cache
def ttf(path):
    font = TTFont(path)
    font.flavor = None
    data = BytesIO()
    font.save(data)
    return data.getvalue()


def runs(mask):
    """The length of the horizontal run of ink each pixel lies in."""
    height, width = mask.shape
    padded = np.zeros((height, width + 2), dtype=np.int8)
    padded[:, 1:-1] = mask
    edges = np.diff(padded.ravel())
    starts, ends = np.where(edges == 1)[0], np.where(edges == -1)[0]
    out = np.zeros(padded.size, dtype=np.int32)
    if len(starts):
        out[np.concatenate([np.arange(a + 1, b + 1) for a, b in zip(starts, ends)])] = np.repeat(ends - starts, ends - starts)
    return out.reshape(height, width + 2)[:, 1:-1]


def stems(glyphs):
    """Mean vertical stem and horizontal bar in em over (font, character) pairs, middle 80%."""
    vertical, horizontal = [], []
    for font, char in glyphs:
        image = Image.new('L', (PX * 2, PX * 2), 0)
        ImageDraw.Draw(image).text((PX // 2, PX // 2), char, font=font, fill=255)
        ink = np.asarray(image) > 127
        across, down = runs(ink), runs(ink.T).T
        vertical.append(across[(down >= 2.5 * across) & ink])
        horizontal.append(down[(across >= 2.5 * down) & ink])
    def mean(values):
        values = np.sort(np.concatenate(values))
        return values[len(values) // 10: len(values) - len(values) // 10].mean() / PX
    return mean(vertical), mean(horizontal)


def static(css, base, weight, chars):
    """The glyphs a weight draws from a sharded family."""
    rules = [(file, points) for (low, *high), file, points in faces(css, base) if low == weight]
    glyphs = []
    for file, points in rules:
        present = [char for char in chars if ord(char) in points]
        if present:
            font = ImageFont.truetype(BytesIO(ttf(file)), PX)
            glyphs += [(font, char) for char in present]
    return glyphs


def variable(file, wght, chars):
    font = ImageFont.truetype(BytesIO(ttf(file)), PX)
    font.set_variation_by_axes([wght])
    return [(font, char) for char in chars]


def matching(file, target, chars):
    """The wght at which a variable font's stem is target, by bisection."""
    low, high = 100.0, 900.0
    for _ in range(11):
        middle = (low + high) / 2
        low, high = (middle, high) if stems(variable(file, middle, chars))[0] < target else (low, middle)
    return round((low + high) / 2)


def main():
    styles = ROOT / 'src/generated/fonts'
    sarasa, maple = styles / 'sarasa.css', styles / 'maple.css'
    montserrat_source = next(file for _, file, _ in faces(FONTSOURCE / 'montserrat/index.css', FONTSOURCE / 'montserrat') if 'montserrat-latin-wght' in file.name)
    bitter_source = next(file for _, file, _ in faces(FONTSOURCE / 'bitter/index.css', FONTSOURCE / 'bitter') if 'bitter-latin-wght' in file.name)
    serif = faces(FONTSOURCE / 'noto-serif-sc/index.css', FONTSOURCE / 'noto-serif-sc')
    shipped = {name: next((file for _, file, _ in faces(styles / f'{name}.css', styles) if f'{name}-latin-wght' in file.name), None)
               for name in ('montserrat', 'bitter') if (styles / f'{name}.css').exists()}
    print(f'{"CSS":>4}  {"Sarasa":>13}  {"Montserrat":>13}  {"calibrated":>13}  {"Maple x.944":>13}  {"Noto Serif":>13}  {"Bitter":>13}  {"calibrated":>13}')
    for weight in WEIGHTS:
        chinese = stems(static(sarasa, styles, weight, HANZI))
        mono_glyphs = static(maple, styles, weight, LATIN)
        mono = stems(mono_glyphs) if mono_glyphs else (float('nan'),) * 2
        serif_glyphs = []
        for _, file, points in serif:
            present = [char for char in HANZI if ord(char) in points]
            if present:
                serif_glyphs += variable(file, weight, present)
        heading = stems(serif_glyphs)
        cells = [chinese, stems(variable(montserrat_source, weight, LATIN)),
                 stems(variable(shipped['montserrat'], weight, LATIN)) if shipped.get('montserrat') else (float('nan'),) * 2,
                 tuple(value * MONO_SCALE for value in mono), heading, stems(variable(bitter_source, weight, LATIN)),
                 stems(variable(shipped['bitter'], weight, LATIN)) if shipped.get('bitter') else (float('nan'),) * 2]
        print(f'{weight:>4}  ' + '  '.join(f'{v:.4f}/{h:.4f}' for v, h in cells))
        print(f'      Montserrat matches Sarasa at wght {matching(montserrat_source, chinese[0], LATIN)}; '
              f'Bitter matches Noto Serif SC at wght {matching(bitter_source, heading[0], LATIN)}')
    print('Each cell: vertical stem / horizontal bar, in em.')


if __name__ == '__main__':
    main()
