import os; os.makedirs('build',exist_ok=True)
import base64, hashlib, re, io
from fontTools import subset
from fontTools.ttLib import TTFont
def font_b64(path):
    opts=subset.Options(); opts.flavor='woff'; opts.layout_features=['*']
    f=subset.load_font(path,opts)
    s=subset.Subsetter(opts)
    uni=list(range(0x20,0x7f))+list(range(0xa0,0x100))+[0x2013,0x2014,0x2018,0x2019,0x201c,0x201e,0x2026,0x20ac,0x2022,0x2192,0x2190,0x2715,0x2713]
    s.populate(unicodes=uni); s.subset(f)
    b=io.BytesIO(); f.flavor='woff'; f.save(b); return 'data:font/woff;base64,'+base64.b64encode(b.getvalue()).decode()
def img_b64(p): return 'data:image/jpeg;base64,'+base64.b64encode(open(p,'rb').read()).decode()
base='./'
css=open('app.css',encoding='utf-8').read().replace('%%FONT500%%',font_b64(base+'Poppins-Medium.ttf')).replace('%%FONT700%%',font_b64(base+'Poppins-Bold.ttf'))
js=open('app.js',encoding='utf-8').read()
h=lambda t:"'sha256-"+base64.b64encode(hashlib.sha256(t.encode('utf-8')).digest()).decode()+"'"
csp=("default-src 'none'; script-src %s; style-src %s; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.basemaps.cartocdn.com; "
     "font-src data:; connect-src 'self' https://nominatim.openstreetmap.org https://router.project-osrm.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com; media-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'; manifest-src 'self'")%(h(js),h(css))
t=open('template.html',encoding='utf-8').read()
t=t.replace('%%CSP%%',csp).replace('%%GLOBE%%',img_b64('globe.jpg')).replace('%%LOGO%%',img_b64('logo_full.jpg')).replace('%%CSS%%',css).replace('%%JS%%',js)
assert '%%' not in t
open('build/IT-WORLD-Routenplaner.html','w',encoding='utf-8').write(t)
open('build/index_built.html','w',encoding='utf-8').write(t)
print(len(t)//1024,'KB')
