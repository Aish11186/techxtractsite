import os
from typing import Optional, Tuple
from PIL import Image, ImageOps

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
]

PATTERN_TO_VAL = {pat: i for i, pat in enumerate(CODE128_PATTERNS)}

def decode_symbols_to_text(symbols: list) -> Optional[str]:
    if not symbols or len(symbols) < 3:
        return None
    start = symbols[0]
    if start == 103:
        mode = 'A'
    elif start == 104:
        mode = 'B'
    elif start == 105:
        mode = 'C'
    else:
        return None

    text = []
    payload = symbols[1:-2]
    for val in payload:
        if mode == 'C':
            if val == 100:
                mode = 'B'
            elif val == 101:
                mode = 'A'
            elif 0 <= val <= 99:
                text.append(f'{val:02d}')
        elif mode == 'B':
            if val == 99:
                mode = 'C'
            elif val == 101:
                mode = 'A'
            elif 0 <= val <= 95:
                text.append(chr(val + 32))
        elif mode == 'A':
            if val == 99:
                mode = 'C'
            elif val == 100:
                mode = 'B'
            elif 0 <= val <= 63:
                text.append(chr(val + 32))
            elif 64 <= val <= 95:
                text.append(chr(val - 64))
    return ''.join(text)

def _decode_from_scan_lines(img: Image.Image) -> Tuple[Optional[str], Optional[str]]:
    w, h = img.size
    step = max(1, h // 35)
    sample_ys = list(range(step, h - step, step))
    if not sample_ys:
        sample_ys = [h // 2]

    last_err = "No valid barcode scan line found"
    thresholds = [128, 100, 145, 80, 165]

    for thresh in thresholds:
        for y in sample_ys:
            row = [img.getpixel((x, y)) for x in range(w)]
            bw = [1 if p < thresh else 0 for p in row]
            black_indices = [i for i, b in enumerate(bw) if b == 1]
            if not black_indices:
                continue

            runs = []
            cur_val = bw[black_indices[0]]
            cur_len = 0
            for b in bw[black_indices[0]:black_indices[-1]+1]:
                if b == cur_val:
                    cur_len += 1
                else:
                    runs.append((cur_val, cur_len))
                    cur_val = b
                    cur_len = 1
            runs.append((cur_val, cur_len))

            if len(runs) < 19 or (len(runs) - 7) % 6 != 0:
                continue

            num_symbols = (len(runs) - 7) // 6
            total_px = sum(r[1] for r in runs)
            min_w = min(r[1] for r in runs)

            norm_candidates = []
            if total_px > 0:
                mod_w = total_px / (num_symbols * 11.0 + 13.0)
                norm_candidates.append([str(max(1, min(4, int(round(r[1] / mod_w))))) for r in runs])
            if min_w > 0:
                norm_candidates.append([str(max(1, min(4, int(round(r[1] / min_w))))) for r in runs])

            for norm in norm_candidates:
                symbols = []
                i = 0
                while i < len(norm):
                    if i + 7 == len(norm):
                        stop_pat = "".join(norm[i:i+7])
                        if stop_pat in ("2331112", "2331111"):
                            symbols.append("2331112")
                        else:
                            symbols.append(stop_pat)
                        break
                    elif i + 6 <= len(norm):
                        symbols.append("".join(norm[i:i+6]))
                        i += 6
                    else:
                        symbols.append("".join(norm[i:]))
                        break

                vals = [PATTERN_TO_VAL.get(s, -1) for s in symbols]
                if -1 in vals or len(vals) < 3 or vals[-1] != 106:
                    continue

                start = vals[0]
                check = vals[-2]
                data = vals[1:-2]
                total = start
                for idx, d in enumerate(data):
                    total += (idx + 1) * d
                if total % 103 != check:
                    last_err = f"Checksum mismatch: expected {check}, got {total % 103}"
                    continue

                decoded_text = decode_symbols_to_text(vals)
                if decoded_text:
                    return decoded_text, None

    return None, last_err

def decode_code128_image(image_input) -> Tuple[Optional[str], Optional[str]]:
    """
    Decodes Code 128 / QR Code / Code 39 / EAN-13 barcodes from a PIL Image, bytes, file, or filepath.
    Uses multi-stage cascade:
      1. EXIF orientation correction.
      2. High-performance zxingcpp (with multi-scale, autocontrast, rotation, inversion, and center crop).
      3. Content bounding box crop for dark-mode screenshots & isolated cards.
      4. Dense scanline decoding fallback.
    Returns (decoded_string, error_message).
    """
    try:
        if isinstance(image_input, str):
            if not os.path.exists(image_input):
                return None, f"File not found: {image_input}"
            raw_img = Image.open(image_input)
        elif isinstance(image_input, bytes):
            import io
            raw_img = Image.open(io.BytesIO(image_input))
        elif isinstance(image_input, Image.Image):
            raw_img = image_input
        else:
            raw_img = Image.open(image_input)

        # 0. EXIF Orientation Normalization (crucial for mobile camera uploads)
        try:
            raw_img = ImageOps.exif_transpose(raw_img)
        except Exception:
            pass

        # Convert to RGB and grayscale for processing
        img_rgb = raw_img.convert("RGB")
        img_l = raw_img.convert("L")

        # 1. High-Performance zxing-cpp Cascade
        try:
            import zxingcpp

            # Try on multiple scales and enhancements
            candidates = [img_rgb, img_l]
            try:
                candidates.append(ImageOps.autocontrast(img_rgb))
            except Exception:
                pass

            for cand in candidates:
                # 1a. Native resolution
                b = zxingcpp.read_barcodes(cand, try_rotate=True, try_downscale=True, try_invert=True)
                if b and b[0].text:
                    return b[0].text.strip(), None

                # 1b. Inverted resolution
                inv_cand = ImageOps.invert(cand)
                b = zxingcpp.read_barcodes(inv_cand, try_rotate=True, try_downscale=True, try_invert=True)
                if b and b[0].text:
                    return b[0].text.strip(), None

                # 1c. Center Crop (focusing on the middle 70% where barcodes usually sit)
                cw, ch = cand.size
                if cw > 400 and ch > 400:
                    center_crop = cand.crop((int(cw * 0.15), int(ch * 0.15), int(cw * 0.85), int(ch * 0.85)))
                    b = zxingcpp.read_barcodes(center_crop, try_rotate=True, try_downscale=True, try_invert=True)
                    if b and b[0].text:
                        return b[0].text.strip(), None

                # 1d. Scaled variants for high-density 1D barcodes
                for sc in [1.5, 2.0, 0.75]:
                    scaled = cand.resize((int(cw * sc), int(ch * sc)), Image.Resampling.LANCZOS)
                    b = zxingcpp.read_barcodes(scaled, try_rotate=True, try_downscale=True, try_invert=True)
                    if b and b[0].text:
                        return b[0].text.strip(), None

            # 1e. Content bounding box crop (for isolated cards on tables or dark-mode screenshots)
            try:
                import numpy as np
                arr = np.array(img_l)
                bright_y, bright_x = np.where(arr > 80)
                if len(bright_y) > 30:
                    c = img_l.crop((bright_x.min(), bright_y.min(), bright_x.max(), bright_y.max()))
                    for sc in [1, 2, 4]:
                        resized = c.resize((c.width * sc, c.height * sc), Image.Resampling.LANCZOS)
                        b = zxingcpp.read_barcodes(resized, try_rotate=True, try_downscale=True, try_invert=True)
                        if b and b[0].text:
                            return b[0].text.strip(), None
                        inv_resized = ImageOps.invert(resized)
                        b = zxingcpp.read_barcodes(inv_resized, try_rotate=True, try_downscale=True, try_invert=True)
                        if b and b[0].text:
                            return b[0].text.strip(), None
            except Exception:
                pass

        except Exception:
            pass

        # 2. Dense Scanline Fallback Engine
        decoded_text, err = _decode_from_scan_lines(img_l)
        if decoded_text:
            return decoded_text, None

        inv_img = ImageOps.invert(img_l)
        decoded_text, _ = _decode_from_scan_lines(inv_img)
        if decoded_text:
            return decoded_text, None

        rot_90 = img_l.rotate(90, expand=True)
        decoded_text, _ = _decode_from_scan_lines(rot_90)
        if decoded_text:
            return decoded_text, None

        if img_l.width < 1200:
            scaled = img_l.resize((img_l.width * 2, img_l.height * 2), Image.Resampling.LANCZOS)
            decoded_text, _ = _decode_from_scan_lines(scaled)
            if decoded_text:
                return decoded_text, None

        return None, err or "No barcode pattern identified in image"
    except Exception as e:
        return None, str(e)
