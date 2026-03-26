"""
Logo Quiz — Contour-based entity removal (v5).

Rasterize SVG, then use connected component analysis to find
individual visual objects (letters, stars, symbols, shapes).

Detection:
  Pass 1: Standard connected components on non-white pixels
  Pass 2: Negative-space text detection for ring-shaped entities only
          (e.g. "FC BAYERN MÜNCHEN" cut into a red ring).
          Skipped for illustration-type entities (many scattered holes).

Removal:
  Regular entities: paint white (expand 2px to remove traces)
  Negspace text: inpaint with surrounding color (fill the letter holes)

All levels keep colors. Progressive: easy → medium → hard.
"""

import os
import subprocess
import tempfile
import cv2
import numpy as np

OUTPUT_DIR = "/private/tmp/logo-contour-test"
SIZE = 512

LOGOS = [
    ("Club Brugge", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg"),
    ("Bayern Munich", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg"),
    ("FC Barcelona", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg"),
    ("Union Saint-Gilloise", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg"),
    ("Ajax", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f605fe448549ca2560b16b_ajax-amsterdam-footballlogos-org.svg"),
]


def download_and_rasterize(url: str) -> np.ndarray:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    svg_data = urllib.request.urlopen(req).read()

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
        cwd="/Users/instashop/Projects/football-quizball/backend",
        check=True, capture_output=True
    )
    img = cv2.imread(png_path)
    os.unlink(svg_path)
    os.unlink(png_path)
    return img


def is_ring_shaped(mask: np.ndarray, total_pixels: int) -> bool:
    """
    Check if an entity is ring-shaped (has a large central hole).
    Ring-shaped = the filled area is significantly larger than the mask area,
    meaning there's a big hole in the middle.
    """
    filled = mask.copy()
    h, w = filled.shape
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(filled, flood_mask, (0, 0), 255)
    filled_inv = cv2.bitwise_not(filled)
    holes = cv2.bitwise_and(filled_inv, cv2.bitwise_not(mask))

    mask_area = np.sum(mask > 0)
    hole_area = np.sum(holes > 0)

    # Ring-shaped: the hole is at least 30% the size of the colored region
    return hole_area > mask_area * 0.3


def find_entities(img: np.ndarray):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)

    kernel_close = np.ones((2, 2), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)

    total_logo_pixels = np.sum(binary > 0)
    if total_logo_pixels == 0:
        return []

    # ── PASS 1: Standard connected components ──
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
            'center_y_norm': cy / img.shape[0],
            'aspect_ratio': w / h if h > 0 else 1.0,
            'mask': mask, 'source': 'pass1',
        })

    # ── PASS 2: Negative-space text on RING-SHAPED entities only ──
    large_entities = [e for e in entities if e['area_pct'] > 15]

    for large_e in large_entities:
        large_mask = large_e['mask']

        # Only process ring-shaped entities (like Bayern's red ring)
        # Skip solid/illustration entities (like Ajax's figure)
        if not is_ring_shaped(large_mask, total_logo_pixels):
            print(f"    [negspace] Skipping non-ring entity (area={large_e['area_pct']:.1f}%)")
            continue

        # Find holes
        filled = large_mask.copy()
        h_img, w_img = filled.shape
        flood_mask = np.zeros((h_img + 2, w_img + 2), np.uint8)
        cv2.floodFill(filled, flood_mask, (0, 0), 255)
        filled_inv = cv2.bitwise_not(filled)
        holes = cv2.bitwise_and(filled_inv, cv2.bitwise_not(large_mask))

        hole_total = np.sum(holes > 0)
        if hole_total < total_logo_pixels * 0.005:
            continue

        # Find individual holes (potential letters)
        hole_num, hole_labels, hole_stats, hole_centroids = cv2.connectedComponentsWithStats(holes, connectivity=8)

        # Count significant holes — if too many, it's artistic detail, not text
        sig_holes = sum(1 for j in range(1, hole_num)
                       if hole_stats[j, cv2.CC_STAT_AREA] / total_logo_pixels * 100 > 0.2)
        if sig_holes > 25:
            print(f"    [negspace] Skipping entity with {sig_holes} holes (artistic detail)")
            continue

        print(f"    [negspace] Ring entity (area={large_e['area_pct']:.1f}%) has {sig_holes} text-like holes")

        for j in range(1, hole_num):
            h_area = hole_stats[j, cv2.CC_STAT_AREA]
            h_pct = h_area / total_logo_pixels * 100

            if h_pct < 0.2 or h_pct > 5.0:
                continue

            hx, hy = hole_stats[j, cv2.CC_STAT_LEFT], hole_stats[j, cv2.CC_STAT_TOP]
            hw, hh = hole_stats[j, cv2.CC_STAT_WIDTH], hole_stats[j, cv2.CC_STAT_HEIGHT]
            h_mask = (hole_labels == j).astype(np.uint8) * 255

            # For negspace: the mask is just the hole itself.
            # We'll use inpainting to fill it with surrounding color.
            entities.append({
                'label': 2000 + len(entities),
                'area': h_area, 'area_pct': h_pct,
                'bbox': (hx, hy, hw, hh),
                'center': (hole_centroids[j][0], hole_centroids[j][1]),
                'center_y_norm': hole_centroids[j][1] / img.shape[0],
                'aspect_ratio': hw / hh if hh > 0 else 1.0,
                'mask': h_mask, 'source': 'negspace',
                'parent_mask': large_mask,
            })

    entities.sort(key=lambda e: e['area'])
    return entities


def classify_entity(entity: dict) -> str:
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

    # Text heuristics
    is_letter = (0.3 < pct < 12
                 and max(w, h) < SIZE * 0.35
                 and min(w, h) > 8)
    is_text_block = 0.3 < pct < 15 and ar > 3.0

    if is_letter or is_text_block:
        return 'TEXT'

    if pct < 5:
        return 'DETAIL'

    return 'CORE'


def remove_entities(img: np.ndarray, entities: list, expand_px: int = 2) -> np.ndarray:
    """
    Remove entities from image.
    - Regular entities: paint white (with expansion for clean edges)
    - Negspace entities: inpaint with surrounding color (fill letter holes)
    """
    result = img.copy()
    expand_kernel = np.ones((expand_px * 2 + 1, expand_px * 2 + 1), np.uint8)

    # First handle regular entities (paint white)
    regular = [e for e in entities if e.get('source') != 'negspace']
    for e in regular:
        expanded = cv2.dilate(e['mask'], expand_kernel, iterations=1)
        result[expanded > 0] = [255, 255, 255]

    # Then handle negspace entities (inpaint with surrounding color)
    negspace = [e for e in entities if e.get('source') == 'negspace']
    if negspace:
        # Combine all negspace masks into one inpainting mask
        combined_mask = np.zeros(img.shape[:2], dtype=np.uint8)
        for e in negspace:
            # Dilate slightly to cover the letter border too
            dilated = cv2.dilate(e['mask'], np.ones((3, 3), np.uint8), iterations=2)
            combined_mask = cv2.bitwise_or(combined_mask, dilated)

        # Use OpenCV inpainting to fill with surrounding colors
        result = cv2.inpaint(result, combined_mask, inpaintRadius=10, flags=cv2.INPAINT_TELEA)

    return result


def make_easy(img, entities):
    """Easy: Remove NOISE + TEXT + DETAIL."""
    if len(entities) <= 2:
        return img.copy(), []

    to_remove = [e for e in entities if classify_entity(e) in ('NOISE', 'TEXT', 'DETAIL')]

    if not to_remove:
        n = max(1, int(len(entities) * 0.3))
        to_remove = entities[:n]

    return remove_entities(img, to_remove), to_remove


def make_medium(easy_img, entities, easy_removed):
    """Medium: From easy output, also remove CORE entities."""
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
    """Hard: From medium output, keep only the single largest entity."""
    remaining = [e for e in entities if e not in medium_removed]
    if len(remaining) <= 1:
        return medium_img.copy(), medium_removed

    remaining_sorted = sorted(remaining, key=lambda e: e['area'])
    additional = remaining_sorted[:-1]

    if not additional:
        return medium_img.copy(), medium_removed

    all_removed = medium_removed + additional
    return remove_entities(medium_img, additional), all_removed


def process_logo(name: str, url: str):
    print(f"\n{'=' * 60}")
    print(f"{name}")
    print('=' * 60)

    slug = name.lower().replace(" ", "-")
    out_dir = os.path.join(OUTPUT_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)

    img = download_and_rasterize(url)
    cv2.imwrite(os.path.join(out_dir, "0-original.png"), img)

    entities = find_entities(img)
    print(f"  Entities found: {len(entities)}")
    for i, e in enumerate(entities):
        cat = classify_entity(e)
        src = e.get('source', '?')
        print(f"    [{i:2d}] area={e['area_pct']:5.1f}%  ar={e['aspect_ratio']:4.1f}  {src:8s}  {cat}")

    # Debug visualization
    debug = img.copy()
    cat_colors = {
        'NOISE': (128, 128, 128), 'TEXT': (0, 0, 255),
        'DETAIL': (0, 165, 255), 'CORE': (0, 255, 255), 'MAIN': (0, 255, 0),
    }
    for i, e in enumerate(entities):
        x, y, w, h = e['bbox']
        cat = classify_entity(e)
        color = cat_colors.get(cat, (255, 255, 255))
        cv2.rectangle(debug, (x, y), (x+w, y+h), color, 2)
        prefix = "*" if e.get('source') == 'negspace' else ""
        cv2.putText(debug, f"{prefix}{i}:{cat[:3]}", (x+2, y+15), cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)
    cv2.imwrite(os.path.join(out_dir, "debug-entities.png"), debug)

    # Progressive difficulty
    easy_img, easy_removed = make_easy(img, entities)
    cv2.imwrite(os.path.join(out_dir, "1-easy.png"), easy_img)
    print(f"  Easy:   removed {len(easy_removed)}/{len(entities)}")

    medium_img, medium_removed = make_medium(easy_img, entities, easy_removed)
    cv2.imwrite(os.path.join(out_dir, "2-medium.png"), medium_img)
    print(f"  Medium: removed {len(medium_removed)}/{len(entities)}")

    hard_img, hard_removed = make_hard(medium_img, entities, medium_removed)
    cv2.imwrite(os.path.join(out_dir, "3-hard.png"), hard_img)
    print(f"  Hard:   removed {len(hard_removed)}/{len(entities)}")

    print(f"  Output: {out_dir}/")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for name, url in LOGOS:
        try:
            process_logo(name, url)
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nAll outputs: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
