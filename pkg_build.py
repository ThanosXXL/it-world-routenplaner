import base64, hashlib, os, shutil, zipfile
H=lambda t:"'sha256-"+base64.b64encode(hashlib.sha256(t.encode()).digest()).decode()+"'"
root='build/pkg/IT-WORLD-Routenplaner'
shutil.rmtree('build/pkg',ignore_errors=True); os.makedirs(root+'/icons')
shutil.copy('build/index_built.html',root+'/index.html')
for f in ['sw.js','manifest.webmanifest']: shutil.copy(f,root+'/'+f)
for f in os.listdir('icons'): shutil.copy('icons/'+f,root+'/icons/'+f)
logo='data:image/jpeg;base64,'+base64.b64encode(open('logo_full.jpg','rb').read()).decode()
css="""*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.2rem;font-family:"Segoe UI","Trebuchet MS",system-ui,sans-serif;color:#f6ecd2;background:radial-gradient(1000px 600px at 50% -10%,#2a1d07,#080502 70%)}
main{max-width:640px;width:100%;text-align:center}img{width:min(240px,60vw);border-radius:28px;border:1px solid #c9951c88;box-shadow:0 24px 50px #000,0 0 40px #e8b83a44;animation:f 6s ease-in-out infinite}
h1{font-size:1.8rem;margin:1rem 0 .3rem;background:linear-gradient(180deg,#fff3b0,#ecc04a 55%,#a8761a);-webkit-background-clip:text;background-clip:text;color:transparent}
p{color:#c9b98c;line-height:1.5;margin:.4rem 0}h2{font-size:1.05rem;margin:1.2rem 0 .5rem;color:#f2c94c}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.8rem 0}
.pf{position:relative;border:0;cursor:pointer;padding:1rem .6rem;border-radius:18px;font:700 1rem inherit;font-family:inherit;color:#fff3b0;background:linear-gradient(180deg,#3a2a0e,#21170a 50%,#120c04);box-shadow:0 1px 0 #ffe9a044 inset,0 0 0 1px #c9951c88,0 5px 0 #000,0 10px 16px #000b;transition:transform .15s,box-shadow .15s}
.pf:hover{transform:translateY(-3px)}.pf:active{transform:translateY(3px)}.pf.sel{color:#2a1a00;background:linear-gradient(180deg,#fff6bd,#f4cd52 38%,#cf9a1d 64%,#a87412);box-shadow:0 1px 0 #fffbe6 inset,0 5px 0 #6b470a,0 12px 20px #000b,0 0 26px #f2c94c88}
.pf .ic{display:block;font-size:2rem;margin-bottom:.2rem}.pf small{display:block;font-weight:600;font-size:.72rem;opacity:.85}
.go{display:inline-block;margin:.6rem 0;padding:1rem 1.6rem;border:0;cursor:pointer;border-radius:16px;font-family:inherit;font-weight:700;font-size:1.1rem;text-decoration:none;color:#2a1a00;background:linear-gradient(180deg,#fff6bd,#f4cd52 38%,#cf9a1d 64%,#a87412);box-shadow:0 1px 0 #fffbe6 inset,0 -3px 6px #6a460a77 inset,0 6px 0 #6b470a,0 12px 20px #000b}
.go.dark{color:#fff3b0;background:linear-gradient(180deg,#3a2a0e,#120c04);box-shadow:0 0 0 1px #c9951c88,0 4px 0 #000}
.box{margin-top:1rem;padding:.9rem 1rem;border-radius:16px;background:#130d05;border:1px solid #c9951c55;text-align:left;font-size:.93rem}
.box ol{margin:.4rem 0 0;padding-left:1.3rem}.box li{margin:.35rem 0}.ok{border-color:#7ddc8f;color:#d8ffd8}.key{display:inline-block;padding:0 .4rem;border:1px solid #c9951c;border-radius:6px;background:#241a0a}
small.c{display:block;margin-top:1.2rem;color:#8d7f5c}
@keyframes f{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@media(prefers-reduced-motion:reduce){img{animation:none}}"""
js=r"""(function(){
var u=navigator.userAgent,$=function(i){return document.getElementById(i)};
var ios=/iPad|iPhone|iPod/.test(u)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
var and=/Android/.test(u),win=/Windows/.test(u),mac=/Macintosh/.test(u)&&!ios,lin=/Linux|X11/.test(u)&&!and;
var dev=ios?'ios':and?'android':win?'win':mac?'mac':lin?'linux':'other';
var ff=/Firefox\/|FxiOS/.test(u),saf=/Safari\//.test(u)&&!/Chrome|Chromium|Edg|OPR|CriOS|FxiOS|SamsungBrowser/.test(u);
var web=/^https?:$/.test(location.protocol),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
var P=[['win','🪟','Windows','10 / 11'],['mac','🍎','Mac','macOS'],['linux','🐧','Linux','Desktop'],['android','🤖','Android','Handy & Tablet'],['ios','📱','iPhone / iPad','iOS & iPadOS']];
var NAME={win:'Windows',mac:'Mac',linux:'Linux',android:'Android',ios:'iPhone / iPad',other:'deinem Gerät'};
var sel=dev==='other'?'win':dev,dp=null,done=false,msg='';
if(web&&'serviceWorker' in navigator){navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(function(){});}
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;render();});
window.addEventListener('appinstalled',function(){done=true;dp=null;render();setTimeout(function(){location.href='index.html';},2200);});
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function steps(list){var o=el('ol');list.forEach(function(s){o.appendChild(el('li',0,s));});return o;}
function manual(id){
 if(id==='ios')return saf||!ios?['Tippe unten in Safari auf das Teilen-Symbol (Quadrat mit Pfeil nach oben).','Wähle „Zum Home-Bildschirm“.','Tippe oben rechts auf „Hinzufügen“ – fertig.']:['Öffne diesen Link in Safari (Apple erlaubt die Installation nur dort).','Dann: Teilen-Symbol → „Zum Home-Bildschirm“ → „Hinzufügen“.'];
 if(id==='mac')return saf?['Öffne in Safari das Menü „Ablage“.','Wähle „Zum Dock hinzufügen“ (ab macOS Sonoma) – fertig.']:['Öffne diesen Link in Chrome oder Edge.','Klicke auf „Installieren“ in der Adressleiste.'];
 if(ff&&id!=='android')return ['Firefox kann Web-Apps am Computer nicht installieren.','Öffne diesen Link in Chrome oder Edge – dort klappt es mit einem Klick.'];
 if(id==='android')return ['Tippe oben rechts auf das Menü ⋮.','Wähle „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.'];
 return ['Klicke in der Adressleiste rechts auf das Installieren-Symbol (kleiner Bildschirm mit Pfeil).','Bestätige mit „Installieren“ – fertig.'];}
function install(){
 if(!dp){msg='Dein Browser meldet sich gleich – bitte einen Moment warten oder die Schritte unten nutzen.';render();return;}
 dp.prompt();dp.userChoice.then(function(c){msg=c.outcome==='accepted'?'Installation läuft …':'Abgebrochen – du kannst es jederzeit erneut versuchen.';dp=c.outcome==='accepted'?null:dp;render();}).catch(function(){});}
function pick(id){sel=id;msg='';render();if(id===dev&&dp&&!standalone)install();}
function render(){
 var g=$('pf');g.textContent='';
 P.forEach(function(p){var b=el('button','pf'+(sel===p[0]?' sel':''));b.type='button';b.appendChild(el('span','ic',p[1]));b.appendChild(document.createTextNode(p[2]));b.appendChild(el('small',0,p[0]===dev?'✔ Dein Gerät':p[3]));b.onclick=function(){pick(p[0]);};g.appendChild(b);});
 var s=$('st');s.textContent='';s.className='box';
 if(done){s.className='box ok';s.appendChild(el('b',0,'✔ Installiert!'));s.appendChild(el('p',0,'Die App öffnet sich gleich. Du findest sie ab jetzt wie jedes andere Programm.'));return;}
 if(standalone){s.className='box ok';s.appendChild(el('b',0,'✔ Schon installiert.'));var a=el('a','go','▶ App öffnen');a.href='index.html';s.appendChild(a);return;}
 if(!web){s.appendChild(el('b',0,'Hinweis'));s.appendChild(el('p',0,'Zum Installieren öffne bitte die https-Adresse, die du von IT-WORLD bekommen hast – nicht als lokale Datei. Du kannst die App sonst direkt im Browser nutzen.'));return;}
 if(sel!==dev&&dev!=='other'){s.appendChild(el('b',0,'Du hast '+NAME[sel]+' gewählt – dieses Gerät ist aber '+NAME[dev]+'.'));s.appendChild(el('p',0,'Öffne diesen Link auf deinem '+NAME[sel]+'-Gerät, dann startet die Installation mit einem Klick:'));
  var c=el('button','go dark','🔗 Link kopieren');c.type='button';c.onclick=function(){var l=location.origin+location.pathname;try{navigator.clipboard.writeText(l).then(function(){c.textContent='✔ Kopiert';});}catch(e){c.textContent=l;}};s.appendChild(c);s.appendChild(steps(manual(sel)));return;}
 if(dp){s.appendChild(el('b',0,'Bereit für '+NAME[sel]+' – ein Klick genügt:'));var b=el('button','go','📲 Jetzt automatisch installieren');b.type='button';b.onclick=install;s.appendChild(b);s.appendChild(el('p',0,'Dein Browser fragt einmal zur Sicherheit nach – bestätige mit „Installieren“.'));}
 else{s.appendChild(el('b',0,'So installierst du auf '+NAME[sel]+':'));s.appendChild(steps(manual(sel)));}
 if(msg)s.appendChild(el('p',0,msg));}
render();$('plat').textContent=dev==='other'?'':'Wir haben dein Gerät erkannt: '+NAME[dev]+'.';
})();"""
html=f"""<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src {H(js)}; style-src {H(css)}; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0a0702">
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" type="image/png" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<title>IT-WORLD Routenplaner – Installieren</title><style>{css}</style></head>
<body><main>
<img src="{logo}" alt="IT-WORLD – IT Solutions" width="240" height="240">
<h1>IT-WORLD Routenplaner</h1>
<p>Schön, dass du da bist! Tippe einfach auf dein Gerät – den Rest erledigt der Browser automatisch.</p>
<p id="plat"></p>
<div class="grid" id="pf"></div>
<div id="st" class="box"></div>
<p><a class="go dark" href="index.html">Lieber direkt im Browser öffnen</a></p>
<div class="box">✔ Ohne Werbung, ohne Pop-ups, ohne Konto<br>✔ Funktioniert auch ohne Internet<br>✔ Updates laufen still im Hintergrund – nichts unterbricht dich<br>✔ Deine Daten bleiben auf deinem Gerät</div>
<small class="c">© 2026 IT-WORLD – IT Solutions. Alle Rechte vorbehalten.</small>
</main><script>{js}</script></body></html>"""
open(root+'/Installieren.html','w',encoding='utf-8').write(html)
open(root+'/_headers','w').write("""/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: frame-ancestors 'none'
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
""")
open(root+'/.htaccess','w').write("""# Für Apache-Webspace (z. B. IONOS, Strato, All-Inkl)
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  Header always set Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=(), usb=()"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Content-Security-Policy "frame-ancestors 'none'"
  <FilesMatch "(sw\\.js|index\\.html|manifest\\.webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
AddType application/manifest+json .webmanifest
# Alles über https erzwingen
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [L,R=301]
""")
open(root+'/LIESMICH.txt','w',encoding='utf-8').write("""IT-WORLD Routenplaner – Vollinstallation (Version 1.1.0)
© 2026 IT-WORLD – IT Solutions. Alle Rechte vorbehalten.

WAS IST DAS?
Ein komplettes Installationspaket für Windows, macOS, Linux, Android und iOS/iPadOS.
Kunden öffnen EINE Webadresse (Installieren.html), tippen auf ihr Gerät (Windows, Mac, Linux, Android, iPhone/iPad) und bestätigen einmal die Sicherheitsabfrage ihres Browsers – fertig.
Die Installation startet automatisch; Apple (iPhone/iPad) und Safari erlauben technisch nur den Weg „Teilen → Zum Home-Bildschirm“, den die Seite Schritt für Schritt zeigt.
Die App läuft danach in einem eigenen Fenster, auch ohne Internet, ohne Werbung, bis der Nutzer sie selbst beendet.
Updates lädt sie still im Hintergrund und aktiviert sie beim nächsten Start – ohne Wartezeit, ohne Unterbrechung.

SO STELLST DU ES BEREIT (einmalig, ca. 5 Minuten)
1. Lade den kompletten Ordner „IT-WORLD-Routenplaner" auf einen Webspace mit HTTPS, z. B.
   - Netlify / Cloudflare Pages / GitHub Pages (Ordner per Drag & Drop oder Git), oder
   - dein eigener Webspace (IONOS, Strato, All-Inkl …).
   Wichtig: HTTPS ist Pflicht, sonst erlauben Browser keine Installation.
2. Gib deinen Kunden den Link  https://DEINE-ADRESSE/Installieren.html
3. Trage in index.html (Suche nach „CFG.contact") deine Anbieterdaten für die Datenschutzerklärung ein.
   Hinweis: Die Prüfsumme im Sicherheits-Header (CSP) ändert sich dabei. Am einfachsten lässt du dir die Datei
   von uns neu erzeugen, statt sie von Hand zu ändern.
4. Die Dateien _headers (Netlify/Cloudflare) bzw. .htaccess (Apache) setzen zusätzliche Sicherheits-Header.

SO VERTEILST DU UPDATES
- Neue Dateien über die alten hochladen (index.html und sw.js ersetzen, in sw.js die VERSION erhöhen).
- Die Geräte der Kunden holen sich die Änderung still im Hintergrund. Gespeicherte Ziele, Favoriten und Listen bleiben erhalten.

OHNE INSTALLATION
Die Datei index.html läuft auch direkt per Doppelklick im Browser (dann ohne Installation und ohne automatische Updates).

WICHTIGE HINWEISE
- Karten, Adresssuche und Routing nutzen öffentliche Dienste (OpenStreetMap, Nominatim, OSRM-Demo). Für den Verkauf an Kunden
  solltest du eigene oder kommerzielle Dienste einsetzen und die Nutzungsbedingungen prüfen.
- Datenschutztext und Lizenzseite sind Muster – bitte rechtlich prüfen lassen und Impressum auf deiner Webseite ergänzen.
- Werbefrei: Das Paket enthält keinerlei Werbung, Tracker oder Fremd-Skripte.
""")
with zipfile.ZipFile('build/IT-WORLD-Routenplaner-Vollinstallation.zip','w',zipfile.ZIP_DEFLATED) as z:
    for d,_,fs in os.walk('build/pkg'):
        for f in fs:
            p=os.path.join(d,f); z.write(p,os.path.relpath(p,'build/pkg'))
print(os.path.getsize('build/IT-WORLD-Routenplaner-Vollinstallation.zip')//1024,'KB')
