"""
Logo Quiz — Rasterized image processing approach.

Rasterize SVG to PNG on solid white background (no alpha), then use
OpenCV color segmentation to identify and selectively remove visual regions.

Easy:   Remove small color clusters (text, small decorations)
Medium: Keep only the dominant color regions (central pattern)
Hard:   Convert to edge-detected outline (like tracing in Photoshop)
"""

import os
import io
import subprocess
import tempfile
import cv2
import numpy as np
from PIL import Image

OUTPUT_DIR = "/private/tmp/logo-raster-test"
SIZE = 512

LOGOS = [
    ("Club Brugge", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg"),
    ("Bayern Munich", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg"),
    ("FC Barcelona", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg"),
    ("Union Saint-Gilloise", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg"),
    ("Ajax", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f605fe448549ca2560b16b_ajax-amsterdam-footballlogos-org.svg"),
]


def download_and_rasterize(url: str) -> np.ndarray:
    """Download SVG, rasterize to PNG on WHITE background (no alpha), return as OpenCV BGR."""
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    svg_data = urllib.request.urlopen(req).read()

    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        f.write(svg_data)
        svg_path = f.name

    png_path = svg_path.replace(".svg", ".png")

    # Rasterize with sharp — FLATTEN onto white background (no transparency)
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


def find_color_regions(img: np.ndarray, n_colors: int = 8):
    """Use K-means to segment the image into distinct color regions."""
    # Reshape to pixel list
    pixels = img.reshape(-1, 3).astype(np.float32)

    # K-means clustering
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(pixels, n_colors, None, criteria, 10, cv2.KMEANS_PP_CENTERS)

    centers = centers.astype(np.uint8)
    labels = labels.flatten()

    # Build region info
    regions = []
    total_pixels = len(labels)
    for i in range(n_colors):
        mask = (labels == i)
        pixel_count = np.sum(mask)
        pct = pixel_count / total_pixels * 100
        color = centers[i]
        is_white = all(c > 240 for c in color)
        is_black = all(c < 30 for c in color)

        # Find bounding box of this region
        mask_2d = mask.reshape(img.shape[:2])
        ys, xs = np.where(mask_2d)
        if len(ys) == 0:
            continue

        bbox_y = (ys.min(), ys.max())
        bbox_x = (xs.min(), xs.max())
        center_y = (bbox_y[0] + bbox_y[1]) / 2 / img.shape[0]

        regions.append({
            'index': i,
            'color': color.tolist(),
            'color_hex': '#{:02x}{:02x}{:02x}'.format(color[2], color[1], color[0]),  # BGR to RGB hex
            'pixel_count': int(pixel_count),
            'pct': pct,
            'is_white': is_white,
            'is_black': is_black,
            'center_y': center_y,
            'bbox': (int(bbox_x[0]), int(bbox_y[0]), int(bbox_x[1]), int(bbox_y[1])),
            'mask': mask_2d,
        })

    # Sort by pixel count descending
    regions.sort(key=lambda r: r['pixel_count'], reverse=True)
    return regions, labels.reshape(img.shape[:2]), centers


def remove_regions(img: np.ndarray, labels_2d: np.ndarray, remove_indices: set) -> np.ndarray:
    """Replace specified region pixels with white."""
    result = img.copy()
    for idx in remove_indices:
        mask = labels_2d == idx
        result[mask] = [255, 255, 255]
    return result


def make_easy(img, regions, labels_2d):
    """Easy: Remove the smallest non-white color regions (text, small decorations)."""
    # Sort non-white regions by size ascending
    non_white = [r for r in regions if not r['is_white']]
    non_white.sort(key=lambda r: r['pixel_count'])

    # Remove the smallest 30% of non-white regions (or at least 1)
    n_remove = max(1, len(non_white) * 30 // 100)
    to_remove = set(r['index'] for r in non_white[:n_remove])

    print(f"  Easy: removing {len(to_remove)} smallest regions")
    for r in non_white[:n_remove]:
        print(f"    - region {r['index']}: {r['color_hex']} ({r['pct']:.1f}%)")

    return remove_regions(img, labels_2d, to_remove)


def make_medium(img, regions, labels_2d):
    """Medium: Keep only the 2-3 largest non-white regions (core visual identity)."""
    non_white = [r for r in regions if not r['is_white']]
    non_white.sort(key=lambda r: r['pixel_count'], reverse=True)

    # Keep the 2 largest non-white regions, remove the rest
    keep_count = min(2, len(non_white))
    keep_indices = set(r['index'] for r in non_white[:keep_count])
    # Also keep white background
    white_indices = set(r['index'] for r in regions if r['is_white'])
    keep_all = keep_indices | white_indices

    to_remove = set(r['index'] for r in regions) - keep_all

    print(f"  Medium: keeping {keep_count} largest non-white regions, removing {len(to_remove)}")
    for r in non_white[:keep_count]:
        print(f"    + keep: {r['color_hex']} ({r['pct']:.1f}%)")

    return remove_regions(img, labels_2d, to_remove)


def make_hard(img):
    """Hard: Edge detection — like tracing the outline in Photoshop."""
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Canny edge detection
    edges = cv2.Canny(blurred, 50, 150)

    # Dilate edges slightly to make them thicker
    kernel = np.ones((2, 2), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Create white background with black edges
    result = np.full_like(img, 255)
    result[edges > 0] = [0, 0, 0]

    return result


def process_logo(name: str, url: str):
    print(f"\nProcessing: {name}")

    slug = name.lower().replace(" ", "-")
    out_dir = os.path.join(OUTPUT_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)

    # Download and rasterize (flattened on white, no alpha)
    img = download_and_rasterize(url)
    cv2.imwrite(os.path.join(out_dir, "0-original.png"), img)

    # Find color regions via K-means
    regions, labels_2d, centers = find_color_regions(img, n_colors=8)

    print(f"  Color regions found: {len(regions)}")
    for r in regions:
        print(f"    [{r['index']}] {r['color_hex']} — {r['pct']:.1f}% {'(white)' if r['is_white'] else '(black)' if r['is_black'] else ''}")

    # Generate difficulty levels
    easy = make_easy(img, regions, labels_2d)
    cv2.imwrite(os.path.join(out_dir, "1-easy.png"), easy)

    medium = make_medium(img, regions, labels_2d)
    cv2.imwrite(os.path.join(out_dir, "2-medium.png"), medium)

    hard = make_hard(img)
    cv2.imwrite(os.path.join(out_dir, "3-hard.png"), hard)

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
