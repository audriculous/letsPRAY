# Build icons/icon.svg from the app's own fonts, with text converted to paths.
# Usage: python3 scripts/icon-svg.py . [light|dark]   (needs: pip install fonttools brotli)
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = sys.argv[1]
VARIANT = sys.argv[2] if len(sys.argv) > 2 else 'light'

def text_path(font_file, text, size, tracking=0.0):
    font = TTFont(f'{ROOT}/fonts/{font_file}')
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font['head'].unitsPerEm
    s = size / upm
    pen = SVGPathPen(gs)
    bpen = BoundsPen(gs)
    x = 0
    for ch in text:
        g = cmap[ord(ch)]
        t = (s, 0, 0, -s, x, 0)
        gs[g].draw(TransformPen(pen, t))
        gs[g].draw(TransformPen(bpen, t))
        x += gs[g].width * s + tracking * size
    return pen.getCommands(), bpen.bounds  # bounds: xmin, ymin, xmax, ymax (y down)

COL = {
    'light': dict(bg='#efede8', ink='#1c1b1a', teal='#4f7a6c', rose='#c87b8d'),
    'dark': dict(bg='#1c1b1a', ink='#efebe5', teal='#8db5a6', rose='#d6929f'),
}[VARIANT]

pray, pb = text_path('barlow-condensed-800i.woff2', 'PRAY', 206, -0.01)
lets, lb = text_path('barlow-600.woff2', 'LET’S', 56, 0.3)

W = 512
pw, ph = pb[2] - pb[0], pb[3] - pb[1]
lw = lb[2] - lb[0]
# Vertical stack: LET'S, PRAY, dash. Centre the group.
gap1, dash_h, gap2 = 30, 24, 34
lh = lb[3] - lb[1]
total = lh + gap1 + ph + gap2 + dash_h
top = (W - total) / 2
lx, ly = (W - lw) / 2 - lb[0], top - lb[1]
px, py = (W - pw) / 2 - pb[0], top + lh + gap1 - pb[1]
dy = top + lh + gap1 + ph + gap2
dash_w = 132

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="116" fill="{COL['bg']}"/>
  <path transform="translate({lx:.1f} {ly:.1f})" fill="{COL['teal']}" d="{lets}"/>
  <path transform="translate({px:.1f} {py:.1f})" fill="{COL['ink']}" d="{pray}"/>
  <rect x="{(W - dash_w) / 2:.1f}" y="{dy:.1f}" width="{dash_w}" height="{dash_h}" rx="{dash_h / 2}" fill="{COL['rose']}" transform="skewX(-14) translate({dy * 0.249:.1f} 0)"/>
</svg>
'''
out = sys.argv[3] if len(sys.argv) > 3 else f'{ROOT}/icons/icon.svg'
open(out, 'w').write(svg)
print(out, 'pray', round(pw), 'x', round(ph), 'lets', round(lw))
