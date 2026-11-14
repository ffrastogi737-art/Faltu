"""Jewel Studio: a designed post (1080x1350 JPG) + a reel (1080x1920 MP4, ~12 s) from ONE real product photo.
All decoration is drawn in code; the product photo is never altered beyond crop/scale.

  python3 jewel.py <photo> <out_prefix> --title "Rani Haar Set" --sub "Necklace + Jhumke" [--price 1299]
"""
import argparse, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageChops
from scipy.io import wavfile
from scipy import signal

MAROON, GOLD, CREAM, DARK = (92, 14, 30), (214, 172, 92), (250, 243, 230), (40, 8, 14)
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
BOLD, SEMI = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf', '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
F = lambda p, s: ImageFont.truetype(p, s)
SHOP, PLACE = 'SHRI RADHA KRISHNA', 'Tilak Road, Dehradun'

def ctext(d, W, y, t, f, fill):
    d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=fill)

def chip(d, W, y, t, f, bg, fg, pad=28):
    w = d.textlength(t, font=f); h = f.size + 24
    d.rounded_rectangle(((W - w) / 2 - pad, y, (W + w) / 2 + pad, y + h), radius=h // 2, fill=bg)
    ctext(d, W, y + 9, t, f, fg)

def arch_mask(w, h):
    m = Image.new('L', (w, h), 0); md = ImageDraw.Draw(m); md.rectangle((0, w // 2, w, h), fill=255); md.ellipse((0, 0, w, w), fill=255); return m

def backdrop(W, H):
    c = Image.new('RGB', (W, H), MAROON); g = Image.new('L', (W, H), 0)
    ImageDraw.Draw(g).ellipse((W * 0.08, H * 0.12, W * 0.92, H * 0.82), fill=120)
    return Image.composite(Image.new('RGB', (W, H), (150, 40, 55)), c, g.filter(ImageFilter.GaussianBlur(160)))

def framed(photo, fw, fh, zoom=1.0, cx=0.5, cy=0.5):
    """photo cropped into an arch with a gold rim; zoom>1 pushes in toward (cx, cy)."""
    pw, ph = photo.size; s = max(fw / pw, fh / ph) * zoom
    big = photo.resize((int(pw * s), int(ph * s)), Image.LANCZOS)
    x = min(max(int(cx * big.width - fw / 2), 0), big.width - fw); y = min(max(int(cy * big.height - fh / 2), 0), big.height - fh)
    crop = big.crop((x, y, x + fw, y + fh)); out = Image.new('RGBA', (fw + 24, fh + 24), (0, 0, 0, 0))
    rim = ImageChops.subtract(arch_mask(fw + 24, fh + 24), ImageOps.expand(arch_mask(fw, fh), 12, 0))
    out.paste(Image.new('RGB', out.size, GOLD), (0, 0), rim); out.paste(crop, (12, 12), arch_mask(fw, fh)); return out

def post(photo, a, path):
    W, H = 1080, 1350; c = backdrop(W, H); d = ImageDraw.Draw(c)
    ctext(d, W, 46, SHOP, F(SERIF, 46), GOLD); ctext(d, W, 106, 'J E W E L L E R S', F(BOLD, 24), CREAM)
    fr = framed(photo, 760, 860); c.paste(fr, ((W - fr.width) // 2, 160), fr); d = ImageDraw.Draw(c)
    ctext(d, W, 1052, a.title, F(SERIF, 72), CREAM)
    chip(d, W, 1150, ('Rs ' + f'{a.price:,}' + '  |  ' if a.price else '') + '1 GRAM GOLD PLATED', F(BOLD, 30), GOLD, DARK)
    ctext(d, W, 1236, a.sub, F(SEMI, 30), CREAM)
    ctext(d, W, 1286, PLACE + ('  |  DM / WhatsApp karein' if a.price else '  |  Price ke liye DM karein'), F(SEMI, 26), GOLD)
    c.save(path, quality=93)

def music(dur, path, sr=48000):
    t = np.arange(int(dur * sr)) / sr; x = np.zeros_like(t); beat = 60 / 84
    chords = [[293.7, 370.0, 440.0], [246.9, 293.7, 370.0], [196.0, 246.9, 293.7], [220.0, 277.2, 329.6]]
    for b in range(int(dur / (beat * 4)) + 1):
        ch = chords[b % 4]
        for k in range(8):
            st = (b * 4 + k / 2) * beat
            if st >= dur: break
            f = ch[[0, 1, 2, 1, 2, 0, 1, 2][k]] * (2 if k % 4 == 2 else 1); i = int(st * sr); n = min(int(1.2 * sr), len(t) - i)
            tt = np.arange(n) / sr; x[i:i + n] += (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 4) * 0.2
        i = int(b * beat * 4 * sr); n = min(int(beat * 4 * sr), len(t) - i)
        if n > 0: tt = np.arange(n) / sr; x[i:i + n] += sum(np.sin(np.pi * f * tt) for f in ch) * 0.05 * np.minimum(1, tt / 0.5)
    b, a_ = signal.butter(2, 3500 / (sr / 2)); x = signal.lfilter(b, a_, x)
    x *= np.minimum(1, t / 0.5) * np.minimum(1, (dur - t) / 1.2); x = x / (np.abs(x).max() + 1e-9) * 0.5
    wavfile.write(path, sr, (np.stack([x, x], 1) * 32767).astype(np.int16))

def reel(photo, a, path, dur=12.0, fps=30):
    W, H = 1080, 1920; bg = backdrop(W, H); FW, FH = 900, 1080
    ease = lambda u: 0.5 - 0.5 * np.cos(np.pi * min(max(u, 0), 1))
    beats = [(0.6, 'title'), (2.4, 'sub'), (4.6, 'plated'), (6.8, 'price'), (9.0, 'place')]
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                           '-i', path + '.wav', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-shortest', path],
                          stdin=subprocess.PIPE)
    for i in range(int(dur * fps)):
        t = i / fps; c = bg.copy(); d = ImageDraw.Draw(c)
        k = ease(t / dur); z = 1 + 0.18 * k; cy = 0.5 + 0.12 * k                        # slow push-in toward the pendant
        fr = framed(photo, FW, FH, z, 0.5, cy); c.paste(fr, ((W - fr.width) // 2, 300), fr); d = ImageDraw.Draw(c)
        sweep = (t * 0.45) % 1.6 - 0.3                                                    # a soft light sweep across the frame
        if 0 < sweep < 1:
            sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).polygon([(sweep * W - 120, 300), (sweep * W, 300), (sweep * W - 300, 1400), (sweep * W - 420, 1400)], fill=60)
            m = Image.new('L', (W, H), 0); m.paste(arch_mask(FW, FH), ((W - FW) // 2, 312))   # sweep only over the photo
            c = Image.composite(Image.new('RGB', (W, H), (255, 245, 220)), c, ImageChops.multiply(sh.filter(ImageFilter.GaussianBlur(30)), m)); d = ImageDraw.Draw(c)
        ctext(d, W, 120, SHOP, F(SERIF, 56), GOLD); ctext(d, W, 192, 'J E W E L L E R S', F(BOLD, 28), CREAM)
        on = lambda name: t >= {n: s for s, n in beats}[name]
        if on('title'): ctext(d, W, 1440, a.title, F(SERIF, 92), CREAM)
        if on('sub'): ctext(d, W, 1560, a.sub, F(SEMI, 40), CREAM)
        if on('plated'): chip(d, W, 1630, '1 GRAM GOLD PLATED', F(BOLD, 38), GOLD, DARK)
        if on('price'): ctext(d, W, 1730, ('Sirf Rs ' + f'{a.price:,}') if a.price else 'Price ke liye DM karein', F(BOLD, 48), GOLD)
        if on('place'): ctext(d, W, 1810, PLACE, F(SEMI, 34), CREAM)
        ff.stdin.write(c.tobytes())
    ff.stdin.close(); ff.wait()

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('photo'); ap.add_argument('out')
    ap.add_argument('--title', required=True); ap.add_argument('--sub', default=''); ap.add_argument('--price', type=int, default=0)
    a = ap.parse_args(); ph = ImageOps.exif_transpose(Image.open(a.photo)).convert('RGB')
    m = int(min(ph.size) * 0.02); ph = ph.crop((m, m, ph.width - m, ph.height - m))   # phone screenshots often carry a light edge
    post(ph, a, a.out + '_post.jpg'); music(12.0, a.out + '_reel.mp4.wav'); reel(ph, a, a.out + '_reel.mp4')
    print('ok', a.out + '_post.jpg', a.out + '_reel.mp4')
