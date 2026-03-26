"""
Retry erasure generation for teams that failed the first batch.

Strategy per failure type:
  too_few_entities (152): Use erosion to break single-blob logos into sub-entities
  easy_too_similar (138): Lower threshold + be more aggressive with removal
  no_progression (102): Only generate easy (we don't need progression anymore)
  download_failed (2): Retry download

Since we only need the EASY difficulty image, the bar is much lower:
just need to remove SOMETHING recognizable from the logo.
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

# Much more relaxed thresholds — we only need easy
MIN_EASY_DIFF = 0.008  # Even 0.8% change counts (was 2%)


def parse_args():
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=")[1])
    return limit


def download_and_rasterize(url):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    svg_data = urllib.request.urlopen(req, timeout=20).read()

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
        check=True, capture_output=True, timeout=20
    )
    img = cv2.imread(png_path)
    os.unlink(svg_path)
    os.unlink(png_path)
    return img


def find_entities_standard(img):
    """Standard connected component detection."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
    kernel = np.ones((2, 2), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    total = np.sum(binary > 0)
    if total == 0:
        return [], binary

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    entities = []
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 15:
            continue
        x, y, w, h = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        mask = (labels == i).astype(np.uint8) * 255
        entities.append({
            'area': area, 'area_pct': area / total * 100,
            'bbox': (x, y, w, h), 'mask': mask, 'source': 'pass1',
            'aspect_ratio': w / h if h > 0 else 1.0,
        })
    entities.sort(key=lambda e: e['area'])
    return entities, binary


def find_entities_with_erosion(img, binary):
    """Break large blobs into sub-entities using erosion."""
    total = np.sum(binary > 0)
    if total == 0:
        return []

    entities = []
    for erode_size in [3, 5, 7]:
        kernel = np.ones((erode_size, erode_size), np.uint8)
        eroded = cv2.erode(binary, kernel, iterations=2)

        num, labels, stats, centroids = cv2.connectedComponentsWithStats(eroded, connectivity=8)
        if num <= 2:
            continue

        # Found sub-entities
        for j in range(1, num):
            area = stats[j, cv2.CC_STAT_AREA]
            pct = area / total * 100
            if pct < 0.5 or pct > 80:
                continue

            x, y, w, h = stats[j, cv2.CC_STAT_LEFT], stats[j, cv2.CC_STAT_TOP], stats[j, cv2.CC_STAT_WIDTH], stats[j, cv2.CC_STAT_HEIGHT]
            # Dilate back to recover original size
            sub_mask = (labels == j).astype(np.uint8) * 255
            sub_mask = cv2.dilate(sub_mask, kernel, iterations=2)
            sub_mask = cv2.bitwise_and(sub_mask, binary)

            real_area = np.sum(sub_mask > 0)
            real_pct = real_area / total * 100

            if real_pct < 0.5 or real_pct > 80:
                continue

            entities.append({
                'area': real_area, 'area_pct': real_pct,
                'bbox': (x, y, w, h), 'mask': sub_mask, 'source': 'erosion',
                'aspect_ratio': w / h if h > 0 else 1.0,
            })

        if entities:
            break  # Use first erosion level that works

    entities.sort(key=lambda e: e['area'])
    return entities


def find_negspace_entities(img, binary):
    """Find white letter-shapes inside colored regions."""
    total = np.sum(binary > 0)
    if total == 0:
        return []

    # Fill holes to find negative space
    filled = binary.copy()
    h, w = filled.shape
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(filled, flood_mask, (0, 0), 255)
    filled_inv = cv2.bitwise_not(filled)
    holes = cv2.bitwise_and(filled_inv, cv2.bitwise_not(binary))

    hole_total = np.sum(holes > 0)
    if hole_total < total * 0.003:
        return []

    num, labels, stats, centroids = cv2.connectedComponentsWithStats(holes, connectivity=8)
    entities = []
    for j in range(1, num):
        area = stats[j, cv2.CC_STAT_AREA]
        pct = area / total * 100
        if pct < 0.15 or pct > 8.0:
            continue

        x, y, w, h = stats[j, cv2.CC_STAT_LEFT], stats[j, cv2.CC_STAT_TOP], stats[j, cv2.CC_STAT_WIDTH], stats[j, cv2.CC_STAT_HEIGHT]
        mask = (labels == j).astype(np.uint8) * 255

        entities.append({
            'area': area, 'area_pct': pct,
            'bbox': (x, y, w, h), 'mask': mask, 'source': 'negspace',
            'aspect_ratio': w / h if h > 0 else 1.0,
        })

    entities.sort(key=lambda e: e['area'])
    return entities


def classify(e):
    pct = e['area_pct']
    ar = e['aspect_ratio']
    _, _, w, h = e['bbox']
    src = e.get('source', '')

    if pct < 0.3:
        return 'NOISE'
    if pct >= 20 and src == 'pass1':
        return 'MAIN'
    if src == 'negspace':
        return 'TEXT'
    if src == 'erosion':
        if pct < 10:
            return 'DETAIL'
        return 'CORE'

    is_letter = 0.3 < pct < 12 and max(w, h) < SIZE * 0.35 and min(w, h) > 8
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
        combined = np.zeros(img.shape[:2], dtype=np.uint8)
        for e in negspace:
            dilated = cv2.dilate(e['mask'], np.ones((3, 3), np.uint8), iterations=2)
            combined = cv2.bitwise_or(combined, dilated)
        result = cv2.inpaint(result, combined, inpaintRadius=10, flags=cv2.INPAINT_TELEA)

    return result


def image_diff_pct(a, b):
    diff = cv2.absdiff(a, b)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    return np.sum(gray > 10) / (gray.shape[0] * gray.shape[1])


def to_webp(img):
    _, buf = cv2.imencode('.webp', img, [cv2.IMWRITE_WEBP_QUALITY, 85])
    return buf.tobytes()


def process_team(name, slug, url):
    """Try multiple strategies to generate an easy erasure."""
    try:
        img = download_and_rasterize(url)
    except Exception as e:
        return False, f"download_failed: {str(e)[:60]}", None

    entities, binary = find_entities_standard(img)

    # Strategy 1: Standard removal (text + detail + noise)
    removable = [e for e in entities if classify(e) in ('NOISE', 'TEXT', 'DETAIL')]
    if removable:
        easy = remove_entities(img, removable)
        diff = image_diff_pct(img, easy)
        if MIN_EASY_DIFF <= diff <= 0.30:
            return save_result(slug, easy, f"standard: entities={len(entities)} diff={diff:.3f}")

    # Strategy 2: Negative-space text detection (for embedded text)
    neg_entities = find_negspace_entities(img, binary)
    if neg_entities:
        easy = remove_entities(img, neg_entities)
        diff = image_diff_pct(img, easy)
        if MIN_EASY_DIFF <= diff <= 0.30:
            return save_result(slug, easy, f"negspace: found={len(neg_entities)} diff={diff:.3f}")

    # Strategy 3: Erosion to break apart single blobs
    erosion_entities = find_entities_with_erosion(img, binary)
    if len(erosion_entities) >= 2:
        # Remove smallest 30-50% of sub-entities
        n_remove = max(1, int(len(erosion_entities) * 0.4))
        to_remove = erosion_entities[:n_remove]
        easy = remove_entities(img, to_remove)
        diff = image_diff_pct(img, easy)
        if MIN_EASY_DIFF <= diff <= 0.30:
            return save_result(slug, easy, f"erosion: sub={len(erosion_entities)} removed={n_remove} diff={diff:.3f}")

    # Strategy 4: Combined — all entities from all strategies
    all_entities = entities + neg_entities + erosion_entities
    all_removable = [e for e in all_entities if classify(e) != 'MAIN']
    if all_removable:
        # Remove smallest 30%
        all_removable.sort(key=lambda e: e['area'])
        n = max(1, int(len(all_removable) * 0.3))
        easy = remove_entities(img, all_removable[:n])
        diff = image_diff_pct(img, easy)
        if MIN_EASY_DIFF <= diff <= 0.30:
            return save_result(slug, easy, f"combined: total={len(all_removable)} removed={n} diff={diff:.3f}")

    # Strategy 5: Force remove the smallest entity — but only if it's a small part
    if entities and entities[0]['area_pct'] < 15:
        easy = remove_entities(img, [entities[0]])
        diff = image_diff_pct(img, easy)
        if MIN_EASY_DIFF <= diff <= 0.30:
            return save_result(slug, easy, f"force_smallest: diff={diff:.3f}")

    return False, f"all_strategies_failed: entities={len(entities)} neg={len(neg_entities)} erosion={len(erosion_entities)}", None


def save_result(slug, easy_img, reason):
    out_dir = os.path.join(OUTPUT_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)
    easy_path = os.path.join(out_dir, "easy.webp")
    with open(easy_path, 'wb') as f:
        f.write(to_webp(easy_img))
    return True, reason, {'easy': easy_path}


def main():
    limit = parse_args()

    with open('/private/tmp/logo-erasures/manifest.json') as f:
        manifest = json.load(f)

    failed_slugs = {f['slug'] for f in manifest['failed']}

    # Also include the 53 we removed in the audit
    audit_path = os.path.join(OUTPUT_DIR, "audit-results.json")
    if os.path.exists(audit_path):
        with open(audit_path) as f:
            audit = json.load(f)
        failed_slugs.update(audit.get('remove', []))

    # Load teams from JSON
    with open(LOGOS_JSON) as f:
        data = json.load(f)

    teams = []
    for comp, team_list in data['by_competition'].items():
        for team in team_list:
            if team.get('slug') in failed_slugs and team.get('real_image_url'):
                teams.append(team)

    if limit:
        teams = teams[:limit]

    print(f"Retry Failed Erasures")
    print(f"  Failed teams to retry: {len(teams)}")
    print()

    results = {'success': [], 'failed': []}
    start = time.time()

    for i, team in enumerate(teams):
        slug = team['slug']
        name = team.get('team_name', slug)
        url = team['real_image_url']

        ok, reason, _ = process_team(name, slug, url)

        if ok:
            results['success'].append({'slug': slug, 'name': name, 'reason': reason})
        else:
            results['failed'].append({'slug': slug, 'name': name, 'reason': reason})

        status = "OK" if ok else "FAIL"
        if (i + 1) % 25 == 0 or i == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(f"  [{i+1:4d}/{len(teams)}] {status:4s} {name[:35]:35s} {reason[:55]}")
            print(f"           Success: {len(results['success'])}  Failed: {len(results['failed'])}  Rate: {rate:.1f}/s")
        else:
            print(f"  [{i+1:4d}/{len(teams)}] {status:4s} {name[:35]:35s} {reason[:60]}")

    elapsed = time.time() - start

    # Save retry manifest
    retry_manifest = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'total_retried': len(teams),
        'success_count': len(results['success']),
        'failed_count': len(results['failed']),
        'elapsed_seconds': round(elapsed, 1),
        'success': results['success'],
        'failed': results['failed'],
    }

    manifest_path = os.path.join(OUTPUT_DIR, "retry-manifest.json")
    with open(manifest_path, 'w') as f:
        json.dump(retry_manifest, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"  DONE in {elapsed:.0f}s")
    print(f"  Recovered: {len(results['success'])}")
    print(f"  Still failed: {len(results['failed'])}")
    print(f"  Manifest: {manifest_path}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
