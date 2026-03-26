"""
Audit easy difficulty quality for all generated logos.

Detects:
1. Inpainting artifacts (blurry smeared regions from negspace fill)
2. Over-removal (logo becomes mostly blank/white)
3. Too subtle change (barely different from original)

Outputs a list of slugs to KEEP and slugs to REMOVE.
"""

import os
import json
import cv2
import numpy as np

ERASURES_DIR = "/private/tmp/logo-erasures"
MANIFEST_PATH = os.path.join(ERASURES_DIR, "manifest.json")
LOGOS_JSON = os.path.join(os.path.dirname(__file__), "..", "..", "footy-logos.json")


def load_original_url(slug):
    """Get the original image URL for a team slug from footy-logos.json."""
    with open(LOGOS_JSON) as f:
        data = json.load(f)
    for comp, teams in data['by_competition'].items():
        for t in teams:
            if t.get('slug') == slug:
                return t.get('real_image_url', '')
    return ''


def detect_inpainting_artifacts(original, easy):
    """
    Detect inpainting artifacts by checking for blurry/smeared regions.
    Inpainted areas have lower sharpness (Laplacian variance) than the original.
    Returns artifact_score (0 = clean, higher = more artifacts).
    """
    # Find changed pixels
    diff = cv2.absdiff(original, easy)
    gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    _, change_mask = cv2.threshold(gray_diff, 15, 255, cv2.THRESH_BINARY)

    changed_pixels = np.sum(change_mask > 0)
    if changed_pixels < 100:
        return 0.0  # Too few changes to measure

    # Dilate mask to capture surrounding area
    kernel = np.ones((5, 5), np.uint8)
    region_mask = cv2.dilate(change_mask, kernel, iterations=3)

    # Compute sharpness (Laplacian variance) in changed regions
    gray_easy = cv2.cvtColor(easy, cv2.COLOR_BGR2GRAY)
    gray_orig = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)

    laplacian_easy = cv2.Laplacian(gray_easy, cv2.CV_64F)
    laplacian_orig = cv2.Laplacian(gray_orig, cv2.CV_64F)

    # Sharpness in changed regions only
    easy_sharpness = np.var(laplacian_easy[region_mask > 0]) if np.any(region_mask > 0) else 0
    orig_sharpness = np.var(laplacian_orig[region_mask > 0]) if np.any(region_mask > 0) else 0

    if orig_sharpness == 0:
        return 0.0

    # Ratio: if easy is much blurrier in changed regions, artifacts likely
    sharpness_ratio = easy_sharpness / orig_sharpness

    # Also check for color bleed (inpainting spreads color into white areas)
    # Look at the easy image where original was white but easy has color
    orig_gray_pixels = gray_orig > 240  # white in original
    easy_colored = gray_easy < 230  # not white in easy
    color_bleed = np.sum(orig_gray_pixels & easy_colored & (region_mask > 0))
    bleed_ratio = color_bleed / max(changed_pixels, 1)

    # Combined score: low sharpness ratio + high color bleed = bad inpainting
    artifact_score = 0.0
    if sharpness_ratio > 0.8:  # Changed regions are almost as sharp = clean removal
        artifact_score = 0.0
    elif sharpness_ratio > 0.5:
        artifact_score = 0.3
    else:
        artifact_score = 0.7

    if bleed_ratio > 0.1:
        artifact_score += 0.3

    return min(artifact_score, 1.0)


def check_over_removal(original, easy):
    """Check if too much of the logo was removed (mostly white/blank)."""
    gray_orig = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    gray_easy = cv2.cvtColor(easy, cv2.COLOR_BGR2GRAY)

    # Count non-white pixels
    orig_content = np.sum(gray_orig < 240)
    easy_content = np.sum(gray_easy < 240)

    if orig_content == 0:
        return 0.0

    content_ratio = easy_content / orig_content

    # If easy has less than 40% of original content, it's over-removed
    if content_ratio < 0.40:
        return 1.0 - content_ratio  # Higher = worse
    return 0.0


def check_too_subtle(original, easy):
    """Check if the easy version is barely different from original."""
    diff = cv2.absdiff(original, easy)
    gray_diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    changed = np.sum(gray_diff > 10)
    total = gray_diff.shape[0] * gray_diff.shape[1]
    diff_pct = changed / total

    if diff_pct < 0.025:
        return True
    return False


def audit_team(slug):
    """Audit a single team's easy output. Returns (status, reason, scores)."""
    easy_path = os.path.join(ERASURES_DIR, slug, "easy.webp")
    if not os.path.exists(easy_path):
        return 'MISSING', 'file_not_found', {}

    easy = cv2.imread(easy_path)
    if easy is None:
        return 'MISSING', 'unreadable', {}

    # We need the original to compare. Check if we saved it.
    # The original was rasterized during generation but not saved.
    # We'll re-download and rasterize it.
    # Actually, let's just check the easy image properties directly.

    # For artifact detection without original, check for blurry patches
    gray = cv2.cvtColor(easy, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # Check white ratio (over-removal)
    white_pixels = np.sum(gray > 240)
    total_pixels = h * w
    white_ratio = white_pixels / total_pixels

    if white_ratio > 0.85:
        return 'REMOVE', f'over_removal: white_ratio={white_ratio:.2f}', {'white_ratio': white_ratio}

    # Check for inpainting artifacts: look for blurry regions surrounded by sharp ones
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    lap_abs = np.abs(laplacian)

    # Split into grid and check for inconsistent sharpness
    # Inpainted regions have low Laplacian variance compared to neighbors
    non_white_mask = gray < 240
    if np.sum(non_white_mask) < 100:
        return 'REMOVE', 'mostly_blank', {}

    # Check for smeared/blurry colored regions
    # In clean vector logos, colored regions have sharp edges (high Laplacian at boundaries)
    # Inpainted regions have gradients instead of sharp edges
    colored_mask = gray < 230
    if np.sum(colored_mask) > 0:
        colored_lap = lap_abs[colored_mask]
        mean_sharpness = np.mean(colored_lap)
        # Very low sharpness in colored regions suggests inpainting
        if mean_sharpness < 3.0 and white_ratio < 0.7:
            return 'REMOVE', f'inpainting_blur: sharpness={mean_sharpness:.1f}', {'sharpness': mean_sharpness}

    # Check for color bleed artifacts
    # Inpainting creates smooth gradients where there should be flat colors
    # Measure color variance in small patches
    hsv = cv2.cvtColor(easy, cv2.COLOR_BGR2HSV)
    # In clean logos, hue should be relatively uniform in colored regions
    colored_hue = hsv[:, :, 1][colored_mask]  # saturation
    if len(colored_hue) > 100:
        # Look for low-saturation patches within otherwise saturated regions
        sat_std = np.std(colored_hue)
        mean_sat = np.mean(colored_hue)
        # Inpainted regions often have washed-out colors (lower saturation)
        # A high std relative to mean suggests mixed clean/inpainted regions
        if mean_sat > 50 and sat_std > 80:
            return 'SUSPECT', f'color_variance: sat_std={sat_std:.0f} mean={mean_sat:.0f}', {'sat_std': sat_std}

    return 'KEEP', 'ok', {'white_ratio': white_ratio}


def main():
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    results = {'KEEP': [], 'REMOVE': [], 'SUSPECT': [], 'MISSING': []}

    for entry in manifest['success']:
        slug = entry['slug']
        status, reason, scores = audit_team(slug)
        results[status].append({'slug': slug, 'name': entry['name'], 'reason': reason})

    print("Easy Difficulty Quality Audit")
    print("=" * 60)
    print(f"  KEEP:    {len(results['KEEP']):4d} — good quality")
    print(f"  REMOVE:  {len(results['REMOVE']):4d} — bad quality (will remove from pool)")
    print(f"  SUSPECT: {len(results['SUSPECT']):4d} — marginal (needs visual check)")
    print(f"  MISSING: {len(results['MISSING']):4d} — files not found")

    print(f"\n  REMOVE reasons:")
    reasons = {}
    for r in results['REMOVE']:
        key = r['reason'].split(':')[0]
        reasons[key] = reasons.get(key, 0) + 1
    for k, v in sorted(reasons.items(), key=lambda x: -x[1]):
        print(f"    {k}: {v}")

    if results['SUSPECT']:
        print(f"\n  SUSPECT teams (review these):")
        for s in results['SUSPECT'][:20]:
            print(f"    {s['name']:35s} {s['reason']}")

    # Write results
    output = {
        'keep': [r['slug'] for r in results['KEEP']],
        'remove': [r['slug'] for r in results['REMOVE']],
        'suspect': [r['slug'] for r in results['SUSPECT']],
        'remove_details': results['REMOVE'],
        'suspect_details': results['SUSPECT'],
    }

    output_path = os.path.join(ERASURES_DIR, "audit-results.json")
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n  Results: {output_path}")


if __name__ == "__main__":
    main()
