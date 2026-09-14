"""Static CPU contact sheet of exported triangles. Lighting approximates materials."""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 640, 440
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
views = json.load(open(sys.argv[1]))
rear = '--rear' in sys.argv
canvas = Image.new('RGB', (W * 2, H * ((len(views) + 1) // 2) + 96), '#101a21')
draw = ImageDraw.Draw(canvas)
draw.text((28, 20), 'DUSTLINE / VEHICLE STUDY', font=ImageFont.truetype(BOLD, 27), fill='#f0e8da')
draw.text((29, 58), 'ACTUAL MODEL GEOMETRY   /   OFFLINE CPU RENDER   /   ' + ('REAR' if rear else 'FRONT'),
          font=ImageFont.truetype(FONT, 13), fill='#8da1ab')

def unit(v):
    return v / np.linalg.norm(v)

forward = unit(np.array([3.4, 2.25, 4.6 if rear else -4.6]))
right = unit(np.cross([0, 1, 0], forward))
up = unit(np.cross(forward, right))
basis = np.array([right, up, forward]).T
light = unit(np.array([-3., 6., -4.]))
halfway = unit(light + forward)

for i, view in enumerate(views):
    data = np.array(view['triangles'])
    tris, props = data[:, :27].reshape(-1, 3, 9), data[:, 27:]
    scale = 115 if view['mode'] == 'car' else 149
    target = np.array([0., 1.1, 0.])
    img = np.full((H, W, 3), [.125, .17, .195])
    depth = np.full((H, W), -1e6)

    def project(points):
        p = (points - target) @ basis
        p[..., 0] = W / 2 + p[..., 0] * scale
        p[..., 1] = H / 2 - p[..., 1] * scale
        return p

    shadow = Image.new('L', (W, H))
    sd = ImageDraw.Draw(shadow)
    for tri in tris:
        points = tri[:, :3].copy()
        points[:, 0] -= points[:, 1] * light[0] / light[1]
        points[:, 2] -= points[:, 1] * light[2] / light[1]
        points[:, 1] = 0
        sd.polygon([tuple(p[:2]) for p in project(points)], fill=90)
    img *= 1 - (np.array(shadow.filter(ImageFilter.GaussianBlur(7))) / 255)[..., None]
    for tri, (roughness, metalness, emission) in zip(tris, props):
        # Match the front-sided materials used by the real models.
        if np.dot(np.cross(tri[1, :3] - tri[0, :3], tri[2, :3] - tri[0, :3]), forward) <= 0:
            continue
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
        shade = .33 + .65*np.maximum(0, normals @ light) + .13*np.maximum(0, normals @ forward)
        gloss = np.maximum(0, normals @ halfway)**(8 + (1 - roughness)*100)
        color = (weights @ tri[:, 6:9]) * (shade[..., None] + emission*.28)
        color += gloss[..., None] * (.1 + metalness*.3) * (1 - roughness)
        color = np.where(color <= .0031308, color*12.92, 1.055*np.maximum(0, color)**(1/2.4)-.055)
        region = img[ymin:ymax+1, xmin:xmax+1]
        region[visible] = color[visible]
        depth[ymin:ymax+1, xmin:xmax+1][visible] = z[visible]
    tile = Image.fromarray(np.uint8(np.clip(img, 0, 1)*255))
    td = ImageDraw.Draw(tile)
    td.line((24, 26, 56, 26), fill='#e59851', width=3)
    td.text((24, H-53), view['name'], font=ImageFont.truetype(BOLD, 20), fill='#f0e8da')
    td.text((24, H-26), f"{len(tris):,} TRIANGLES / {view['meshes']} MATERIAL BATCHES", font=ImageFont.truetype(FONT, 11), fill='#acbbc3')
    canvas.paste(tile, ((i % 2)*W, 96 + (i // 2)*H))
canvas.save(sys.argv[2])
print(sys.argv[2])
