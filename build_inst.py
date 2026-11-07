import base64,hashlib,re
app=open('build/pkg/IT-WORLD-Routenplaner/index.html','rb').read()
payload=base64.b64encode(app).decode()
logo=base64.b64encode(open('build/pkg/IT-WORLD-Routenplaner/icons/icon-192.png','rb').read()).decode()
css='''*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;color:#f3e7c9;background:radial-gradient(ellipse at 50% -10%,#2b1f08,#0a0702 55%,#000) fixed;min-height:100vh;padding:24px 16px 60px;line-height:1.6}
.w{max-width:760px;margin:0 auto;text-align:center}img.l{width:112px;height:112px;border-radius:26px;box-shadow:0 0 40px #e8b84a55,inset 0 0 0 1px #e8b84a66;animation:f 4s ease-in-out infinite}
@keyframes f{50%{transform:translateY(-6px)}}h1{margin:14px 0 4px;font-size:30px;background:linear-gradient(#fff3c4,#e8b84a 55%,#9a6a10);-webkit-background-clip:text;background-clip:text;color:transparent}
p.s{color:#c9b88f;margin-bottom:22px}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:18px 0}
button.p{cursor:pointer;border:1px solid #5a4416;border-radius:18px;padding:18px 8px;color:#f3e7c9;font:inherit;font-weight:700;background:linear-gradient(#1d1608,#0c0904);box-shadow:0 8px 20px #0008,inset 0 1px 0 #ffffff22;transition:.2s}
button.p:hover,button.p:focus-visible{transform:translateY(-3px);border-color:#e8b84a;outline:0}button.p span{display:block;font-size:30px}button.p small{display:block;font-weight:400;color:#c9b88f;font-size:12px}
button.p.me{background:linear-gradient(#f7dc83,#e8b84a 55%,#b88416);color:#2a1d04;border-color:#fff3c4}button.p.me small{color:#4a3508}
.b{text-align:left;background:#0f0c06;border:1px solid #3a2d12;border-radius:16px;padding:16px 18px;margin:14px 0;display:none}.b.on{display:block}.b h2{color:#e8b84a;font-size:17px;margin-bottom:6px}.b ol{margin-left:20px}
.ft{margin-top:26px;font-size:12px;color:#9b8c68}a{color:#e8b84a}.ok{color:#9be29b;font-weight:700}'''
html='''<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IT-WORLD Routenplaner – Installation</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src @@CH@@; script-src @@JH@@; base-uri 'none'; form-action 'none'">
<style>@@CSS@@</style></head><body><div class="w">
<img class="l" alt="IT-WORLD" src="data:image/png;base64,@@LOGO@@">
<h1>IT-WORLD Routenplaner</h1><p class="s">Wähle Dein Gerät – die Installation richtet sich von selbst ein.<br>Ohne Werbung, ohne Konto, ohne Internet-Pflicht.</p>
<div class="g" id="g"></div><div id="msg"></div>
<div class="b" id="b-win"><h2>Windows</h2><ol><li>Öffne die geladene Datei <b>IT-WORLD-Routenplaner-Setup.cmd</b> per Doppelklick.</li><li>Falls Windows warnt: „Weitere Informationen“ → „Trotzdem ausführen“.</li><li>Fertig: Die Verknüpfung liegt auf Deinem Desktop und im Startmenü.</li></ol></div>
<div class="b" id="b-mac"><h2>Mac</h2><ol><li>Die Datei <b>IT-WORLD-Routenplaner-Setup.command</b> mit Rechtsklick → „Öffnen“ starten und bestätigen.</li><li>Fertig: Die Verknüpfung liegt auf Deinem Schreibtisch, die App öffnet sich.</li></ol></div>
<div class="b" id="b-lin"><h2>Linux</h2><ol><li>Im Terminal: <b>bash IT-WORLD-Routenplaner-Setup.sh</b></li><li>Fertig: Der Eintrag erscheint im Anwendungsmenü und auf dem Desktop.</li></ol></div>
<div class="b" id="b-and"><h2>Android</h2><ol><li>Die App-Datei wurde geladen. Öffne sie in „Dateien“ mit Chrome.</li><li>Für die echte Installation: Öffne den Online-Link Deines Anbieters in Chrome → Menü ⋮ → „App installieren“.</li></ol></div>
<div class="b" id="b-ios"><h2>iPhone / iPad</h2><ol><li>Die App-Datei wurde geladen (Dateien-App).</li><li>Für die Installation: Online-Link in <b>Safari</b> öffnen → Teilen-Symbol → „Zum Home-Bildschirm“ → „Hinzufügen“.</li></ol></div>
<p class="ft">Werbefrei · Updates laufen still im Hintergrund · Alle Daten bleiben auf Deinem Gerät<br>© 2026 IT-WORLD – IT Solutions</p></div>
<script type="text/plain" id="pl">@@PLD@@</script>
<script>@@JS@@</script></body></html>'''
js=r'''(function(){"use strict";
var P=document.getElementById("pl").textContent.replace(/\s+/g,""),N="IT-WORLD Routenplaner";
function wrap(s){return s.replace(/(.{76})/g,"$1\n")}
function save(name,text,type){var a=document.createElement("a"),u=URL.createObjectURL(new Blob([text],{type:type||"application/octet-stream"}));a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},4000)}
function win(){var c=["@echo off","chcp 65001 >nul","title "+N,"set \"D=%LOCALAPPDATA%\\"+N+"\"","mkdir \"%D%\" 2>nul",
"powershell -NoProfile -ExecutionPolicy Bypass -Command \"$t=Get-Content -Raw -LiteralPath '%~f0'; $b=($t -split ('::'+'DATA::'))[1] -replace '[^A-Za-z0-9+/=]',''; [IO.File]::WriteAllBytes('%D%\\index.html',[Convert]::FromBase64String($b)); $w=New-Object -ComObject WScript.Shell; foreach($p in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){$s=$w.CreateShortcut($p+'\\"+N+".lnk'); $s.TargetPath='%D%\\index.html'; $s.Save()}\"",
"if errorlevel 1 (echo Etwas ist schiefgelaufen. & pause & exit /b 1)","echo.","echo  Fertig! "+N+" liegt auf Deinem Desktop.","start \"\" \"%D%\\index.html\"","pause","exit /b","::DATA::",wrap(P)];
save("IT-WORLD-Routenplaner-Setup.cmd",c.join("\r\n")+"\r\n")}
function mac(){var c=["#!/bin/bash","D=\"$HOME/Applications/"+N+"\"","mkdir -p \"$D\"","awk 'f{print} /^#PAYLOAD#$/{f=1}' \"$0\" | (base64 -D 2>/dev/null || base64 -d) > \"$D/index.html\" || { echo Fehler; exit 1; }",
"U=\"file://$(printf '%s' \"$D/index.html\" | sed 's/ /%20/g')\"","printf '<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>URL</key><string>%s</string></dict></plist>' \"$U\" > \"$HOME/Desktop/"+N+".webloc\"","echo \"Fertig! "+N+" liegt auf Deinem Schreibtisch.\"","open \"$D/index.html\"","exit 0","#PAYLOAD#",wrap(P)];
save("IT-WORLD-Routenplaner-Setup.command",c.join("\n")+"\n")}
function lin(){var c=["#!/usr/bin/env bash","set -e","D=\"$HOME/.local/share/it-world-routenplaner\"","mkdir -p \"$D\" \"$HOME/.local/share/applications\"","awk 'f{print} /^#PAYLOAD#$/{f=1}' \"$0\" | base64 -d > \"$D/index.html\"",
"cat > \"$HOME/.local/share/applications/it-world-routenplaner.desktop\" <<EOF","[Desktop Entry]","Type=Application","Name="+N,"Comment=Routenplaner mit bis zu 60 Zielen","Exec=xdg-open $D/index.html","Terminal=false","Categories=Utility;","EOF",
"chmod +x \"$HOME/.local/share/applications/it-world-routenplaner.desktop\"","[ -d \"$HOME/Desktop\" ] && cp \"$HOME/.local/share/applications/it-world-routenplaner.desktop\" \"$HOME/Desktop/\" || true","echo \"Fertig! "+N+" steht jetzt im Anwendungsmenü.\"","xdg-open \"$D/index.html\" >/dev/null 2>&1 || true","exit 0","#PAYLOAD#",wrap(P)];
save("IT-WORLD-Routenplaner-Setup.sh",c.join("\n")+"\n")}
function app(){var s=atob(P),a=new Uint8Array(s.length),i;for(i=0;i<s.length;i++)a[i]=s.charCodeAt(i);save("IT-WORLD-Routenplaner.html",new Blob([a],{type:"text/html"}),"text/html")}
var ops=[["win","🪟","Windows","Setup.cmd",win],["mac","🍎","Mac","Setup.command",mac],["lin","🐧","Linux","Setup.sh",lin],["and","🤖","Android","App-Datei",app],["ios","📱","iPhone / iPad","App-Datei",app]];
var ua=navigator.userAgent,me=/iPhone|iPad|iPod/.test(ua)||(/Mac/.test(ua)&&navigator.maxTouchPoints>1)?"ios":/Android/.test(ua)?"and":/Windows/.test(ua)?"win":/Mac/.test(ua)?"mac":/Linux|X11/.test(ua)?"lin":"";
var g=document.getElementById("g");
ops.forEach(function(o){var b=document.createElement("button");b.type="button";b.className="p"+(o[0]===me?" me":"");b.id="btn-"+o[0];
var s=document.createElement("span");s.textContent=o[1];b.appendChild(s);b.appendChild(document.createTextNode(o[2]));var sm=document.createElement("small");sm.textContent=o[0]===me?"✔ Dein Gerät – jetzt installieren":"Installation laden";b.appendChild(sm);
b.onclick=function(){try{o[4]()}catch(e){document.getElementById("msg").textContent="Das hat nicht geklappt: "+e.message;return}
[].forEach.call(document.querySelectorAll(".b"),function(x){x.classList.remove("on")});document.getElementById("b-"+o[0]).classList.add("on");
var m=document.getElementById("msg");m.textContent="";var k=document.createElement("p");k.className="ok";k.textContent="✔ Wird geladen – folge jetzt den Schritten unten.";m.appendChild(k)};g.appendChild(b)});
})();'''
def h(t):return "'sha256-"+base64.b64encode(hashlib.sha256(t.encode()).digest()).decode()+"'"
import re
m={'CH':h(css),'JH':h(js),'CSS':css,'LOGO':logo,'JS':js,'PLD':payload}
out=re.sub(r'@@(\w+)@@',lambda x:m[x.group(1)],html)
open('build/IT-WORLD-Routenplaner-Installer.html','w',encoding='utf8').write(out)
print(len(out))
