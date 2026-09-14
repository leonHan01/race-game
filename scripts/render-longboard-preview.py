"""Rasterize exported model triangles with numpy/Pillow; does not start the game."""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, SCALE = 440, 490, 195 if '--turn-transition' in sys.argv else 215
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
views = json.load(open(sys.argv[1]))
columns = 2 if '--turns' in sys.argv or '--balance' in sys.argv else 4
canvas = Image.new('RGB', (W * columns, H * ((len(views) + columns - 1) // columns) + 116), '#101a21')
draw = ImageDraw.Draw(canvas)
draw.text((28, 20), 'RIDGELINE / DOWNHILL', font=ImageFont.truetype(BOLD, 29), fill='#f0e8da')
draw.text((29, 60), 'RIDER STUDY     /     ACTUAL MODEL GEOMETRY     /     OFFLINE CPU RENDER', font=ImageFont.truetype(FONT, 13), fill='#8da1ab')

def unit(v):
    return v / np.linalg.norm(v)

forward = unit(np.array([4.8, 1.6, -1.4]) if '--balance' in sys.argv or '--push' in sys.argv else np.array([.9, 2.6, 4.6]) if '--turns' in sys.argv else np.array([3., 1.9, 3.7 if '--rear' in sys.argv else -3.7]))
right = unit(np.cross([0, 1, 0], forward))
up = unit(np.cross(forward, right))
basis = np.array([right, up, forward]).T
light = unit(np.array([-3., 6., -4.]))

for i, view in enumerate(views):
    tris = np.array(view['triangles']).reshape(-1, 3, 9)
    img = np.empty((H, W, 3), dtype=float)
    img[:] = np.array([.125, .17, .195])
    depth = np.full((H, W), -1e6)
    target = np.array([0., .73, 0.])

    def project(points):
        p = (points - target) @ basis
        p[..., 0] = W / 2 + p[..., 0] * SCALE
        p[..., 1] = H / 2 + 12 - p[..., 1] * SCALE
        return p

    shadow = Image.new('L', (W, H))
    sd = ImageDraw.Draw(shadow)
    for tri in tris:
        points = tri[:, :3].copy()
        points[:, 0] -= points[:, 1] * light[0] / light[1]
        points[:, 2] -= points[:, 1] * light[2] / light[1]
        points[:, 1] = 0
        screen = project(points)
        sd.polygon([tuple(p[:2]) for p in screen], fill=90)
    mask = np.array(shadow.filter(ImageFilter.GaussianBlur(6))) / 255
    img *= 1 - mask[..., None]
    for tri in tris:
        screen = project(tri[:, :3])
        xmin, ymin = np.maximum(0, np.floor(screen[:, :2].min(axis=0))).astype(int)
        xmax, ymax = np.minimum([W - 1, H - 1], np.ceil(screen[:, :2].max(axis=0))).astype(int)
        if xmax < xmin or ymax < ymin:
            continue
        x, y = np.meshgrid(np.arange(xmin, xmax + 1) + .5, np.arange(ymin, ymax + 1) + .5)
        a, b, c = screen
        denom = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denom) < 1e-8:
            continue
        wa = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1])) / denom
        wb = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1])) / denom
        wc = 1-wa-wb
        z = wa*a[2]+wb*b[2]+wc*c[2]
        visible = (wa >= 0) & (wb >= 0) & (wc >= 0) & (z > depth[ymin:ymax+1, xmin:xmax+1])
        if not visible.any():
            continue
        weights = np.stack([wa, wb, wc], axis=-1)
        normals = weights @ tri[:, 3:6]
        normals /= np.maximum(1e-6, np.linalg.norm(normals, axis=-1, keepdims=True))
        shade = .38 + .60*np.maximum(0, normals @ light) + .10*np.maximum(0, normals @ -forward)
        color = np.maximum(0, weights @ tri[:, 6:9]) * shade[..., None]
        color = np.where(color <= .0031308, color*12.92, 1.055*np.maximum(0, color)**(1/2.4)-.055)
        region = img[ymin:ymax+1, xmin:xmax+1]
        region[visible] = color[visible]
        depth[ymin:ymax+1, xmin:xmax+1][visible] = z[visible]
    tile = Image.fromarray(np.uint8(np.clip(img, 0, 1)*255))
    td = ImageDraw.Draw(tile)
    if '--balance' in sys.argv:
        support = project(np.array(view['supportFoot']))
        pelvis = np.array(view['pelvis'])
        on_deck = pelvis.copy()
        on_deck[1] = .16
        start, end = project(pelvis), project(on_deck)
        for dash in range(0, 12, 2):
            a = start + (end - start) * dash / 12
            b = start + (end - start) * (dash + 1) / 12
            td.line((a[0], a[1], b[0], b[1]), fill='#e9b775', width=2)
        td.ellipse((support[0]-15, support[1]-8, support[0]+15, support[1]+8), outline='#ffd08b', width=2)
        td.ellipse((start[0]-4, start[1]-4, start[0]+4, start[1]+4), fill='#e9b775')
    td.line((20, 22, 52, 22), fill='#e59851', width=3)
    td.text((20, H-57), view['name'], font=ImageFont.truetype(BOLD, 18), fill='#f0e8da')
    td.text((20, H-31), view['detail'], font=ImageFont.truetype(FONT, 12), fill='#acbbc3')
    canvas.paste(tile, ((i % columns)*W, 98 + (i // columns)*H))
canvas.save(sys.argv[2])
print(sys.argv[2])
