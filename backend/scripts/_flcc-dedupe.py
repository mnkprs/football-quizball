#!/usr/bin/env python3
"""
Deduplicate new-logos.json against footy-logos.json using normalized
slug/name matching. Writes:
  - new-logos.json               (filtered clean list)
  - probable-dupes.json          (what was removed, for manual review)
  - new-logos.original.json      (backup of the pre-filter file, once)
"""
import json, re, os, shutil

ROOT = os.path.join(os.path.dirname(__file__), '_flcc-downloads')
NEW = os.path.join(ROOT, 'new-logos.json')
BACKUP = os.path.join(ROOT, 'new-logos.original.json')
DUPES = os.path.join(ROOT, 'probable-dupes.json')
EXISTING = os.path.join(os.path.dirname(__file__), '..', '..', 'footy-logos.json')

# Prefixes/suffixes commonly bolted onto club slugs
NOISE = r'\b(fc|cf|sc|ac|fk|kf|sk|hc|cd|ca|sp|sv|tv|as|us|aik|bk|gnk|hnk|kv|krc|rsc|kvc|kaa|kas|afc)\b'

def norm(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(NOISE, '', s)
    s = re.sub(r'[^a-z0-9]+', '', s)
    return s

def main():
    existing = json.load(open(EXISTING))
    new = json.load(open(NEW))

    # Build lookup of everything already in the DB (slug OR name OR alt-name)
    known = {}  # normalized -> existing identifier
    for comp, teams in existing['by_competition'].items():
        for t in teams:
            for candidate in filter(None, [t.get('slug'), t.get('team_name')]):
                n = norm(candidate)
                if n and n not in known:
                    known[n] = t.get('slug') or t.get('team_name')

    kept = {}
    dupes = []

    for country, logos in new.get('by_country', {}).items():
        keep_list = []
        for l in logos:
            slug_n = norm(l.get('slug', ''))
            name_n = norm(l.get('team_name', ''))
            alt_ns = [norm(a) for a in l.get('alt_names', [])]
            match = None
            for n in [slug_n, name_n, *alt_ns]:
                if n and n in known:
                    match = known[n]
                    break
            if match:
                dupes.append({
                    'country': country,
                    'slug': l.get('slug'),
                    'team_name': l.get('team_name'),
                    'matches_existing': match,
                })
            else:
                keep_list.append(l)
        if keep_list:
            kept[country] = keep_list

    # Backup original once
    if not os.path.exists(BACKUP):
        shutil.copyfile(NEW, BACKUP)

    # Update stats + by_country in place, keep every other field
    total_kept = sum(len(v) for v in kept.values())
    new['by_country'] = kept
    if 'stats' not in new:
        new['stats'] = {}
    new['stats']['after_dedupe'] = {
        'kept': total_kept,
        'removed': len(dupes),
        'countries_with_kept': len(kept),
    }

    with open(NEW, 'w') as f:
        json.dump(new, f, indent=2)
    with open(DUPES, 'w') as f:
        json.dump({'count': len(dupes), 'dupes': dupes}, f, indent=2)

    print(f'kept:    {total_kept} logos across {len(kept)} countries')
    print(f'removed: {len(dupes)} probable dupes -> {DUPES}')
    print(f'backup:  {BACKUP}')

if __name__ == '__main__':
    main()
