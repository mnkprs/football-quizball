"""
Logo Quiz — Batch erasure generation for all teams.

Reads footy-logos.json, processes teams without erasures using the contour pipeline,
validates quality, and outputs results + manifest.

Usage:
  python3 scripts/batch-generate-erasures.py [--limit=N] [--offset=N]

Output:
  /private/tmp/logo-erasures/       — generated images (slug/easy.webp, medium.webp, hard.webp)
  /private/tmp/logo-erasures/manifest.json — results manifest
"""

import os
import sys
import json
import subprocess
import tempfile
import time
import cv2
import numpy as np

OUTPUT_DIR = "/private/tmp/logo-erasures"
SIZE = 512
LOGOS_JSON = os.path.join(os.path.dirname(__file__), "..", "..", "footy-logos.json")

# ─── Quality thresholds ───────────────────────────────────────
MIN_ENTITIES = 3          # Need at least 3 entities for meaningful difficulty
MIN_EASY_DIFF = 0.02      # Easy must differ from original by at least 2%
MIN_MEDIUM_DIFF = 0.05    # Medium must differ from easy by at least 5%
MIN_HARD_DIFF = 0.03      # Hard must differ from medium by at least 3%


def parse_args():
    limit = None
    offset = 0
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=")[1])
        if arg.startswith("--offset="):
            offset = int(arg.split("=")[1])
    return limit, offset


def download_and_rasterize(url: str) -> np.ndarray:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    svg_data = urllib.request.urlopen(req, timeout=15).read()

    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        f.write(svg_data)
        svg_path = f.name

    png_path = svg_path.replace(".svg", ".png")
    node_script = f"""
    const sharp = require('sharp');
    sharp('{svg_path}')
      .resize({SIZE}, {SIZE}, {{ fit: 'contain', background: {{ r: 255, g: 255, b: 255, alpha: 1 }} }})
      .flatten({{ background: {{ r: 255, g: 255, b: 255 }} }})
      .png()
      .toFile('{png_path}')
      .then(() => process.exit(0))
      .catch(e => {{ console.error(e); process.exit(1); }});
    """
    subprocess.run(
        ["node", "-e", node_script],
        cwd=os.path.join(os.path.dirname(__file__), ".."),
        check=True, capture_output=True, timeout=15
    )
    img = cv2.imread(png_path)
    os.unlink(svg_path)
    os.unlink(png_path)
    return img


def is_ring_shaped(mask, total_pixels):
    filled = mask.copy()
    h, w = filled.shape
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(filled, flood_mask, (0, 0), 255)
    filled_inv = cv2.bitwise_not(filled)
    holes = cv2.bitwise_and(filled_inv, cv2.bitwise_not(mask))
    mask_area = np.sum(mask > 0)
    hole_area = np.sum(holes > 0)
    return hole_area > mask_area * 0.3


def find_entities(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
    kernel_close = np.ones((2, 2), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)

    total_logo_pixels = np.sum(binary > 0)
    if total_logo_pixels == 0:
        return []

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    entities = []

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 20:
            continue
        x, y, w, h = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        cx, cy = centroids[i]
        area_pct = area / total_logo_pixels * 100
        mask = (labels == i).astype(np.uint8) * 255
        entities.append({
            'label': i, 'area': area, 'area_pct': area_pct,
            'bbox': (x, y, w, h), 'center': (cx, cy),
            'aspect_ratio': w / h if h > 0 else 1.0,
            'mask': mask, 'source': 'pass1',
        })

    # Negative-space text on ring-shaped entities
    large_entities = [e for e in entities if e['area_pct'] > 15]
    for large_e in large_entities:
        large_mask = large_e['mask']
        if not is_ring_shaped(large_mask, total_logo_pixels):
            continue

        filled = large_mask.copy()
        h_img, w_img = filled.shape
        flood_mask = np.zeros((h_img + 2, w_img + 2), np.uint8)
        cv2.floodFill(filled, flood_mask, (0, 0), 255)
        filled_inv = cv2.bitwise_not(filled)
        holes = cv2.bitwise_and(filled_inv, cv2.bitwise_not(large_mask))

        hole_total = np.sum(holes > 0)
        if hole_total < total_logo_pixels * 0.005:
            continue

        hole_num, hole_labels, hole_stats, hole_centroids = cv2.connectedComponentsWithStats(holes, connectivity=8)
        sig_holes = sum(1 for j in range(1, hole_num)
                       if hole_stats[j, cv2.CC_STAT_AREA] / total_logo_pixels * 100 > 0.2)
        if sig_holes > 25:
            continue

        for j in range(1, hole_num):
            h_area = hole_stats[j, cv2.CC_STAT_AREA]
            h_pct = h_area / total_logo_pixels * 100
            if h_pct < 0.2 or h_pct > 5.0:
                continue
            hx, hy = hole_stats[j, cv2.CC_STAT_LEFT], hole_stats[j, cv2.CC_STAT_TOP]
            hw, hh = hole_stats[j, cv2.CC_STAT_WIDTH], hole_stats[j, cv2.CC_STAT_HEIGHT]
            h_mask = (hole_labels == j).astype(np.uint8) * 255
            entities.append({
                'label': 2000 + len(entities),
                'area': h_area, 'area_pct': h_pct,
                'bbox': (hx, hy, hw, hh),
                'center': (hole_centroids[j][0], hole_centroids[j][1]),
                'aspect_ratio': hw / hh if hh > 0 else 1.0,
                'mask': h_mask, 'source': 'negspace',
            })

    entities.sort(key=lambda e: e['area'])
    return entities


def classify_entity(entity):
    pct = entity['area_pct']
    ar = entity['aspect_ratio']
    _, _, w, h = entity['bbox']
    source = entity.get('source', 'pass1')

    if pct < 0.3:
        return 'NOISE'
    if pct >= 20 and source == 'pass1':
        return 'MAIN'
    if source == 'negspace':
        return 'TEXT'

    is_letter = (0.3 < pct < 12 and max(w, h) < SIZE * 0.35 and min(w, h) > 8)
    is_text_block = 0.3 < pct < 15 and ar > 3.0
    if is_letter or is_text_block:
        return 'TEXT'
    if pct < 5:
        return 'DETAIL'
    return 'CORE'


def remove_entities(img, entities, expand_px=2):
    result = img.copy()
    expand_kernel = np.ones((expand_px * 2 + 1, expand_px * 2 + 1), np.uint8)

    regular = [e for e in entities if e.get('source') != 'negspace']
    for e in regular:
        expanded = cv2.dilate(e['mask'], expand_kernel, iterations=1)
        result[expanded > 0] = [255, 255, 255]

    negspace = [e for e in entities if e.get('source') == 'negspace']
    if negspace:
        combined_mask = np.zeros(img.shape[:2], dtype=np.uint8)
        for e in negspace:
            dilated = cv2.dilate(e['mask'], np.ones((3, 3), np.uint8), iterations=2)
            combined_mask = cv2.bitwise_or(combined_mask, dilated)
        result = cv2.inpaint(result, combined_mask, inpaintRadius=10, flags=cv2.INPAINT_TELEA)

    return result


def make_easy(img, entities):
    if len(entities) <= 2:
        return img.copy(), []
    to_remove = [e for e in entities if classify_entity(e) in ('NOISE', 'TEXT', 'DETAIL')]
    if not to_remove:
        n = max(1, int(len(entities) * 0.3))
        to_remove = entities[:n]
    return remove_entities(img, to_remove), to_remove


def make_medium(easy_img, entities, easy_removed):
    remaining = [e for e in entities if e not in easy_removed]
    if len(remaining) <= 2:
        return easy_img.copy(), easy_removed
    additional = [e for e in remaining if classify_entity(e) == 'CORE']
    if not additional and len(remaining) > 3:
        remaining_sorted = sorted(remaining, key=lambda e: e['area'])
        n = max(1, int(len(remaining) * 0.5))
        additional = remaining_sorted[:n]
    all_removed = easy_removed + additional
    return remove_entities(easy_img, additional), all_removed


def make_hard(medium_img, entities, medium_removed):
    remaining = [e for e in entities if e not in medium_removed]
    if len(remaining) <= 1:
        return medium_img.copy(), medium_removed
    remaining_sorted = sorted(remaining, key=lambda e: e['area'])
    additional = remaining_sorted[:-1]
    if not additional:
        return medium_img.copy(), medium_removed
    all_removed = medium_removed + additional
    return remove_entities(medium_img, additional), all_removed


def image_diff_pct(img_a, img_b):
    """Percentage of pixels that differ between two images."""
    diff = cv2.absdiff(img_a, img_b)
    gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    changed = np.sum(gray_diff > 10)
    total = gray_diff.shape[0] * gray_diff.shape[1]
    return changed / total


def to_webp(img):
    """Convert OpenCV image to WebP bytes."""
    _, buf = cv2.imencode('.webp', img, [cv2.IMWRITE_WEBP_QUALITY, 85])
    return buf.tobytes()


def process_team(team_name, slug, url):
    """Process a single team. Returns (success, reason, paths_dict)."""
    try:
        img = download_and_rasterize(url)
    except Exception as e:
        return False, f"download_failed: {str(e)[:80]}", None

    entities = find_entities(img)

    if len(entities) < MIN_ENTITIES:
        return False, f"too_few_entities: {len(entities)}", None

    # Generate levels
    easy_img, easy_removed = make_easy(img, entities)
    medium_img, medium_removed = make_medium(easy_img, entities, easy_removed)
    hard_img, hard_removed = make_hard(medium_img, entities, medium_removed)

    # Quality validation
    easy_diff = image_diff_pct(img, easy_img)
    medium_diff = image_diff_pct(easy_img, medium_img)
    hard_diff = image_diff_pct(medium_img, hard_img)

    if easy_diff < MIN_EASY_DIFF:
        return False, f"easy_too_similar: {easy_diff:.3f}", None

    # If medium and hard are identical to easy (no progression), fail
    total_diff = image_diff_pct(img, hard_img)
    if total_diff < 0.05:
        return False, f"no_progression: total_diff={total_diff:.3f}", None

    # Save outputs
    out_dir = os.path.join(OUTPUT_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)

    easy_path = os.path.join(out_dir, "easy.webp")
    medium_path = os.path.join(out_dir, "medium.webp")
    hard_path = os.path.join(out_dir, "hard.webp")

    with open(easy_path, 'wb') as f:
        f.write(to_webp(easy_img))
    with open(medium_path, 'wb') as f:
        f.write(to_webp(medium_img))
    with open(hard_path, 'wb') as f:
        f.write(to_webp(hard_img))

    return True, f"ok: entities={len(entities)} easy_diff={easy_diff:.3f} med_diff={medium_diff:.3f} hard_diff={hard_diff:.3f}", {
        'easy': easy_path,
        'medium': medium_path,
        'hard': hard_path,
    }


def main():
    limit, offset = parse_args()

    with open(LOGOS_JSON) as f:
        data = json.load(f)

    # Collect teams needing generation
    teams = []
    our_supabase = "npwneqworgyclzaofuln.supabase.co"
    for comp, team_list in data['by_competition'].items():
        for team in team_list:
            # Skip teams that already have erasures on our Supabase
            has_ours = (team.get('image_url') or '').find(our_supabase) >= 0
            if has_ours:
                continue
            if not team.get('real_image_url'):
                continue
            teams.append(team)

    total = len(teams)
    teams = teams[offset:]
    if limit:
        teams = teams[:limit]

    print(f"Batch Erasure Generation")
    print(f"  Total needing generation: {total}")
    print(f"  Processing: {len(teams)} (offset={offset}, limit={limit or 'all'})")
    print(f"  Output: {OUTPUT_DIR}")
    print()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    results = {'success': [], 'failed': []}
    start_time = time.time()

    for i, team in enumerate(teams):
        slug = team.get('slug', '')
        name = team.get('team_name', slug)
        url = team['real_image_url']

        success, reason, paths = process_team(name, slug, url)

        if success:
            results['success'].append({'slug': slug, 'name': name, 'reason': reason})
        else:
            results['failed'].append({'slug': slug, 'name': name, 'reason': reason})

        # Progress
        status = "OK" if success else "FAIL"
        if (i + 1) % 25 == 0 or i == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(teams) - i - 1) / rate if rate > 0 else 0
            print(f"  [{i+1:4d}/{len(teams)}] {status:4s} {name[:35]:35s} {reason[:50]}")
            print(f"           Rate: {rate:.1f}/s  ETA: {eta:.0f}s  Success: {len(results['success'])}  Failed: {len(results['failed'])}")
        else:
            print(f"  [{i+1:4d}/{len(teams)}] {status:4s} {name[:35]:35s} {reason[:60]}")

    # Write manifest
    elapsed = time.time() - start_time
    manifest = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'total_processed': len(teams),
        'success_count': len(results['success']),
        'failed_count': len(results['failed']),
        'elapsed_seconds': round(elapsed, 1),
        'success': results['success'],
        'failed': results['failed'],
    }

    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print()
    print(f"{'=' * 60}")
    print(f"  DONE in {elapsed:.0f}s")
    print(f"  Success: {len(results['success'])}")
    print(f"  Failed:  {len(results['failed'])}")
    print(f"  Manifest: {manifest_path}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
