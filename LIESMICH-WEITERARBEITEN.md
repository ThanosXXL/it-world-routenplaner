# IT-WORLD Routenplaner – Quellcode (Version 1.1.0)

Einzeldatei-Web-App (PWA), kein Framework, kein Server. Läuft auf Windows, macOS, Linux, Android, iOS.

## Dateien
- template.html – Seitengerüst · app.css – Gold/Schwarz-3D-Design · app.js – komplette Logik
- build.py – baut alles zu EINER Datei inkl. Logo, Poppins-Schrift und CSP-Hashes
- pkg_build.py – baut das Kunden-Paket (index.html, Installieren.html mit 5 Plattform-Buttons, sw.js, manifest, Icons, ZIP)
- build_inst.py – baut den Offline-Installer (eine HTML-Datei, App eingebettet)
- sw.js (Service Worker, stille Updates ohne skipWaiting) · manifest.webmanifest · icons/
- fertig_IT-WORLD-Routenplaner.html – fertige Einzeldatei zum Ausprobieren

## Bauen
Python 3 + `pip install fonttools brotli`. In build.py, pkg_build.py, build_inst.py sind Pfade
(/home/claude/…) und der Schrift-Ordner (base=…) fest eingetragen – an das eigene System anpassen
(Schriften Poppins-Medium/-Bold liegen hier im Ordner). Reihenfolge: build.py → pkg_build.py → build_inst.py.

## Feste Vorgaben des Auftraggebers
- Keinerlei Werbung, keine Zwischenseiten – die App läuft, bis der Nutzer sie beendet.
- Updates immer still im Hintergrund, nie Anzeige stören oder warten lassen.
- Logo: schwarz/goldener Globus (IT-WORLD), 3D-Stil, Hochglanz, lebendige Animationen, warme Schrift.
- DSGVO: Einwilligung je Dienst, nichts wird ohne Zustimmung gesendet, strenge CSP, Backup (optional AES-256).
- Funktionen: bis 60 Ziele, Einzelnavigation je Stopp, Favoriten (einzeln/Listen), Foto-Import, Aufenthalt ca. 5 Min,
  Dauer je Etappe + Gesamtdauer, Live-Tour mit „Nächstes Ziel starten · Anfahrt“ und „Aufenthalt überspringen“ (3D-Zielanzeige).
- Noch offen: Screenshot-Import der Ziele 1:1, Hintergrundmusik (lounge-band-1.mp3), Impressum/CFG.contact, Lizenzschlüssel + Kopierschutz.
- Ändert man index.html von Hand, müssen die CSP-Hashes neu berechnet werden (build.py macht das).
