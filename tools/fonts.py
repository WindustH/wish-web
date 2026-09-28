#!/usr/bin/env python3
"""Fetch the fonts the app ships and generate what it loads, into src/generated/fonts/.

None of it is kept in the repository. The sources are pinned in tools/fonts.json (URL and
SHA-256) and downloaded into .cache/fonts/ once; the Latin fonts come from node_modules. The
output is rebuilt only when the pins, the installed @fontsource packages or the build scripts
change, so every build after the first reuses it.

Requires Python fontTools + Brotli + NumPy and 7z, and ./pnpmw install.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PINS = ROOT / 'tools/fonts.json'
CACHE = ROOT / '.cache/fonts'
OUT = ROOT / 'src/generated/fonts'
SCRIPTS = [ROOT / 'tools/fonts.py', ROOT / 'tools/build-cjk-fonts.py', ROOT / 'tools/build-latin-fonts.py']
PACKAGES = ['montserrat', 'bitter', 'noto-serif-sc']


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def fetch(pin):
    """The pinned file in the cache, downloaded and checked first if need be."""
    path = CACHE / pin['url'].rsplit('/', 1)[1]
    if path.exists() and sha256(path) == pin['sha256']:
        return path
    CACHE.mkdir(parents=True, exist_ok=True)
    print(f'fonts: downloading {pin["url"]}', file=sys.stderr)
    partial = path.with_name(path.name + '.part')
    with urllib.request.urlopen(pin['url']) as response, partial.open('wb') as file:
        shutil.copyfileobj(response, file)
    actual = sha256(partial)
    if actual != pin['sha256']:
        partial.unlink()
        sys.exit(f'fonts: {path.name} has SHA-256 {actual}, not the pinned {pin["sha256"]}')
    partial.replace(path)
    return path


def stamp(pins):
    """What the output depends on: the pins, the build scripts and the installed Latin fonts."""
    digest = hashlib.sha256(json.dumps(pins, sort_keys=True).encode())
    for script in SCRIPTS:
        digest.update(script.read_bytes())
    for name in PACKAGES:
        digest.update((ROOT / 'node_modules/@fontsource-variable' / name / 'package.json').read_bytes())
    return digest.hexdigest()


def main():
    pins = json.loads(PINS.read_text())
    sources = {key: fetch(pin) for key, pin in pins.items()}
    current = stamp(pins)
    record = OUT / '.stamp'
    if record.exists() and record.read_text() == current:
        return
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for key in ('sarasa', 'maple'):
        subprocess.run([sys.executable, ROOT / 'tools/build-cjk-fonts.py', key, sources[key]], check=True)
    subprocess.run([sys.executable, ROOT / 'tools/build-latin-fonts.py'], check=True)
    (OUT / 'stix').mkdir()
    shutil.copy(sources['stix'], OUT / 'stix' / sources['stix'].name)
    record.write_text(current)


if __name__ == '__main__':
    main()
