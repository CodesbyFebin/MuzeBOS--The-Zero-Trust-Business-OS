"""Reproduce reviewed sparse checkouts. Never executes upstream code."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--destination', required=True)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
destination = Path(args.destination).expanduser().resolve()
if destination == project or project in destination.parents:
    parser.error('Choose a destination outside the application repository.')
destination.mkdir(parents=True, exist_ok=True)
catalog = json.loads((project / 'lib/metabos/source-catalog.json').read_text())
environment = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_LFS_SKIP_SMUDGE': '1'}
for source in catalog:
    repo, revision = source['repo'], source['sha']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Invalid pinned source identity')
    target = destination / repo.replace('/', '__')
    if target.is_symlink():
        raise RuntimeError(f'Refusing symlink destination: {target}')
    if not target.exists():
        target.mkdir()
        subprocess.run(['git', 'init', str(target)], check=True, env=environment)
        subprocess.run(['git', '-C', str(target), 'remote', 'add', 'origin', f'https://github.com/{repo}.git'], check=True, env=environment)
        subprocess.run(['git', '-C', str(target), 'fetch', '--depth=1', '--filter=blob:none', 'origin', revision], check=True, env=environment)
        subprocess.run(['git', '-C', str(target), 'sparse-checkout', 'init', '--cone'], check=True, env=environment)
        subprocess.run(['git', '-C', str(target), 'checkout', '--detach', 'FETCH_HEAD'], check=True, env=environment)
    actual = subprocess.check_output(['git', '-C', str(target), 'rev-parse', 'HEAD'], text=True, env=environment).strip()
    if actual != revision:
        raise RuntimeError(f'{repo}: existing revision differs; no files reset or overwritten')
    print(f'{repo} {revision} verified')
