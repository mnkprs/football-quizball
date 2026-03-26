"""
Logo Quiz — Geometric mask approach.

Easy:   Crop bottom 25% (removes club name text)
Medium: Circular mask showing center 70% (core crest only)
Hard:   Black silhouette (outer shape, no internal detail)

Works on any logo format. No AI. 100% deterministic.
"""

import os
import io
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFilter

OUTPUT_DIR = "/private/tmp/logo-mask-test"
SIZE = 512

LOGOS = [
    ("Club Brugge", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6445fa72f2d8896f6a9d5_club-brugge-footballlogos-org.svg"),
    ("Bayern Munich", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f59397e06d4f150c04e9ef_bayern-munich-footballlogos-org.svg"),
    ("FC Barcelona", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f5633874f0b7adc82bc7f5_fc-barcelona-footballlogos-org.svg"),
    ("Union Saint-Gilloise", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6452043db6227ce0fad7d_union-saint-gilloise-footballlogos-org.svg"),
    ("Ajax", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f605fe448549ca2560b16b_ajax-amsterdam-footballlogos-org.svg"),
    ("Real Madrid", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f561b8e06d4f150c0162e3_real-madrid-footballlogos-org.svg"),
    ("Liverpool", "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f55d5b48d2e8128e1f5eb2_liverpool-footballlogos-org.svg"),
]


def download_svg_as_png(url: str) -> Image.Image:
    """Download SVG from URL and convert to PNG using sharp (Node.js)."""
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    svg_data = urllib.request.urlopen(req).read()

    # Write SVG to temp file, use sharp via Node one-liner to convert
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        f.write(svg_data)
        svg_path = f.name

    png_path = svg_path.replace(".svg", ".png")
    node_script = f"""
    const sharp = require('sharp');
    sharp('{svg_path}')
      .resize({SIZE}, {SIZE}, {{ fit: 'contain', background: {{ r: 255, g: 255, b: 255, alpha: 0 }} }})
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

    img = Image.open(png_path).convert("RGBA")
    os.unlink(svg_path)
    os.unlink(png_path)
    return img


def find_content_bbox(img: Image.Image) -> tuple:
    """Find the bounding box of non-white/non-transparent content."""
    # Get alpha channel — anything with alpha > 10 is content
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        return bbox
    # Fallback: use the full image
    return (0, 0, img.width, img.height)


def make_easy(img: Image.Image) -> Image.Image:
    """Easy: Remove bottom 25% (club name text area)."""
    result = img.copy()
    draw = ImageDraw.Draw(result)
    w, h = result.size

    # Find where the actual logo content is
    bbox = find_content_bbox(img)
    content_bottom = bbox[3]
    content_top = bbox[1]
    content_height = content_bottom - content_top

    # Mask bottom 25% of the content area
    cut_y = content_top + int(content_height * 0.75)
    draw.rectangle([0, cut_y, w, h], fill=(255, 255, 255, 255))

    return result


def make_medium(img: Image.Image) -> Image.Image:
    """Medium: Circular mask showing only the center portion."""
    w, h = img.size

    # Find content center
    bbox = find_content_bbox(img)
    cx = (bbox[0] + bbox[2]) // 2
    cy = (bbox[1] + bbox[3]) // 2
    content_w = bbox[2] - bbox[0]
    content_h = bbox[3] - bbox[1]

    # Circle radius = 35% of the smaller content dimension
    radius = int(min(content_w, content_h) * 0.35)

    # Create circular mask
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=255
    )

    # Apply mask
    result = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    result.paste(img, (0, 0), mask=mask)

    return result


def make_hard(img: Image.Image) -> Image.Image:
    """Hard: Black silhouette — just the outer shape, no internal detail."""
    w, h = img.size

    # Get alpha channel (the shape)
    alpha = img.getchannel("A")

    # Threshold to clean up any semi-transparent pixels
    alpha = alpha.point(lambda x: 255 if x > 30 else 0)

    # Create black silhouette on white background
    result = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    black = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    result.paste(black, (0, 0), mask=alpha)

    return result


def process_logo(name: str, url: str):
    print(f"Processing: {name}")

    slug = name.lower().replace(" ", "-")
    out_dir = os.path.join(OUTPUT_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)

    # Download and convert
    img = download_svg_as_png(url)

    # Save original
    img.save(os.path.join(out_dir, "0-original.png"))

    # Generate difficulty levels
    make_easy(img).save(os.path.join(out_dir, "1-easy.png"))
    make_medium(img).save(os.path.join(out_dir, "2-medium.png"))
    make_hard(img).save(os.path.join(out_dir, "3-hard.png"))

    print(f"  Output: {out_dir}/")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for name, url in LOGOS:
        try:
            process_logo(name, url)
        except Exception as e:
            print(f"  ERROR: {e}")

    print(f"\nAll outputs: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
