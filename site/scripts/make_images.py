#!/usr/bin/env python3
"""Make the smaller copies of every gallery photo: one for the grid, one for the viewer.

    python scripts/make_images.py            make the missing copies in images/out/
    python scripts/make_images.py --force    remake every copy
    python scripts/make_images.py --upload   make them, upload the ones the bucket lacks, then --check
    python scripts/make_images.py --check    record the copies that load from the CDN in src/images.json

Originals are downloaded through the CDN (read only) into images/originals/ and are
never changed. Each photo gets two WebP copies, without metadata (GPS, camera details):

    thumbs/<original path>.webp   800px wide, for the gallery grid
    large/<original path>.webp    at most 2000px on the long side, for the viewer

images/out/ mirrors the bucket, so uploading is one sync per folder (see README).
build.js only uses copies listed in src/images.json, so the site never links a copy
that has not been uploaded yet.

Uploading writes only to thumbs/ and large/. The AWS key is read from the usual places
(AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or the role the GitHub workflow assumes),
never from this repo.

Needs Pillow, and boto3 for --upload (pip install Pillow boto3).
"""

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
from urllib.parse import unquote_plus, urlsplit

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = ROOT / "src" / "categories"
MANIFEST = ROOT / "src" / "images.json"
ORIGINALS = ROOT / "images" / "originals"
OUT = ROOT / "images" / "out"

# The bucket behind cdn.txyde.com
BUCKET = "txyde"
REGION = "eu-north-1"
CACHE_CONTROL = "public, max-age=31536000"

# folder -> (how to resize, WebP quality)
SIZES = {
    "thumbs": ("width", 800, 75),
    "large": ("box", 2000, 82),
}

Image.MAX_IMAGE_PIXELS = None  # archive scans can be huge; they come from our own bucket


def photo_urls():
    urls = []
    for file in sorted(CATEGORIES.glob("*.json")):
        for photo in json.loads(file.read_text(encoding="utf-8"))["photos"]:
            if photo["image"] not in urls:
                urls.append(photo["image"])
    return urls


def key(url):
    """'https://cdn.txyde.com/03_Root_Final/A+b%2C+c.jpg' -> '03_Root_Final/A b, c.jpg' (the bucket key)."""
    return unquote_plus(urlsplit(url).path.lstrip("/"))


def copy_key(url, folder):
    return str(PurePosixPath(folder) / PurePosixPath(key(url)).with_suffix(".webp"))


def copy_url(url, folder):
    """The copy's URL, encoded the same way as the original's."""
    parts = urlsplit(url)
    path = str(PurePosixPath(parts.path).with_suffix(".webp"))
    return f"{parts.scheme}://{parts.netloc}/{folder}{path}"


def fetch(url, method="GET"):
    request = urllib.request.Request(url, method=method, headers={"User-Agent": "txyde-make-images"})
    return urllib.request.urlopen(request, timeout=60)


def download(url):
    file = ORIGINALS / key(url)
    if not file.exists():
        file.parent.mkdir(parents=True, exist_ok=True)
        with fetch(url) as response:
            data = response.read()
        file.write_bytes(data)
    return file


def resize(image, how, size):
    if how == "width":
        if image.width <= size:
            return image
        return image.resize((size, round(image.height * size / image.width)), Image.LANCZOS)
    image = image.copy()
    image.thumbnail((size, size), Image.LANCZOS)  # never enlarges
    return image


def make_copies(url, force):
    """Returns (url, original bytes, copies bytes) or (url, error message)."""
    try:
        targets = {folder: OUT / copy_key(url, folder) for folder in SIZES}
        original = download(url)
        if force or not all(t.exists() for t in targets.values()):
            with Image.open(original) as image:
                icc = image.info.get("icc_profile")  # colour profile: kept, so colours stay true
                image = ImageOps.exif_transpose(image)  # apply the camera rotation before metadata is dropped
                alpha = image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)
                image = image.convert("RGBA" if alpha else "RGB")
                for folder, (how, size, quality) in SIZES.items():
                    targets[folder].parent.mkdir(parents=True, exist_ok=True)
                    resize(image, how, size).save(targets[folder], "WEBP", quality=quality, method=6, icc_profile=icc)
        return url, original.stat().st_size, sum(t.stat().st_size for t in targets.values())
    except Exception as err:
        return url, f"{type(err).__name__}: {err}"


def make(force):
    urls = photo_urls()
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda u: make_copies(u, force), urls))

    failed = [r for r in results if len(r) == 2]
    done = [r for r in results if len(r) == 3]
    before = sum(r[1] for r in done)
    after = sum(r[2] for r in done)
    print(f"{len(done)} of {len(urls)} photos have copies in {OUT.relative_to(ROOT)}/")
    if done:
        print(f"Originals {before / 1e6:.1f} MB, copies {after / 1e6:.1f} MB (both sizes together)")
    if failed:
        print("\nFailed:")
        print("\n".join(f"  {url}: {error}" for url, error in failed))


def upload(force):
    import boto3
    from botocore.exceptions import ClientError

    if boto3.Session().get_credentials() is None:
        sys.exit("No AWS key found: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (see README).")
    s3 = boto3.client("s3", region_name=REGION)

    def in_bucket(name):
        # Asked of the bucket, not the CDN, so the CDN never caches a "not found" for a copy about to be uploaded.
        try:
            s3.head_object(Bucket=BUCKET, Key=name)
            return True
        except ClientError as err:
            if err.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return False
            raise

    def send(url):
        sent = []
        for folder in SIZES:
            name, file = copy_key(url, folder), OUT / copy_key(url, folder)
            if file.exists() and (force or not in_bucket(name)):
                s3.upload_file(str(file), BUCKET, name, ExtraArgs={"ContentType": "image/webp", "CacheControl": CACHE_CONTROL})
                sent.append(name)
        return sent

    with ThreadPoolExecutor(max_workers=8) as pool:
        sent = [name for names in pool.map(send, photo_urls()) for name in names]
    print(f"Uploaded {len(sent)} copies to s3://{BUCKET}/")


def is_live(url):
    try:
        with fetch(url, method="HEAD") as response:
            return response.status == 200
    except Exception:
        return False


def check():
    urls = photo_urls()
    with ThreadPoolExecutor(max_workers=16) as pool:
        live = list(pool.map(lambda u: all(is_live(copy_url(u, f)) for f in SIZES), urls))

    manifest, missing = {}, []
    for url, ok in zip(urls, live):
        thumb_file = OUT / copy_key(url, "thumbs")
        if not ok or not thumb_file.exists():
            missing.append(url)
            continue
        with Image.open(thumb_file) as thumb:
            width, height = thumb.size  # lets the grid reserve space before the image loads
        manifest[url] = {"thumb": copy_url(url, "thumbs"), "large": copy_url(url, "large"), "width": width, "height": height}

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{MANIFEST.relative_to(ROOT)}: {len(manifest)} of {len(urls)} photos use their copies")
    if missing:
        print(f"\nNot on the CDN yet (or not made locally), the site keeps the original for these {len(missing)}:")
        print("\n".join(f"  {url}" for url in missing))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    force = "--force" in sys.argv
    if "--check" in sys.argv:
        check()
    else:
        make(force)
        if "--upload" in sys.argv:
            upload(force)
            check()
