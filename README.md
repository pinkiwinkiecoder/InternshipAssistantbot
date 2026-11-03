# StageLog Terminal ❯_

Een stagelogboek-app in PowerShell-stijl. Elke dag noteer je wat je gedaan hebt, welke fouten je maakte en wat je geleerd hebt. Een gratis AI vraagt door en maakt er een net logboek van.

**Indeling van elke dag:**

```
Datum
Productief
 - taken
Fouten / leermomenten
 - Probleem: … → Oplossing: … → Geleerd: …
```

## Waarom het 100% gratis is
- Gewone HTML/CSS/JS, zonder server. Gratis te hosten op GitHub Pages.
- Je logs staan **lokaal op je apparaat** (browser-opslag).
- AI via je **eigen gratis sleutel**:
  - Google Gemini: https://aistudio.google.com/apikey (aanrader)
  - Groq: https://console.groq.com/keys
- Zonder AI werkt de app ook, alleen zonder de slimme hulp.

> ⚠️ Gratis AI-diensten mogen je tekst soms gebruiken om te trainen. Zet geen vertrouwelijke bedrijfsinformatie, wachtwoorden of klantnamen in je log.

## Commando's
| Commando | Wat het doet |
|---|---|
| `New-Log` | Log van vandaag schrijven (AI-interview) |
| `Add-Task "…"` / `Add-Lesson "…"` | Snel iets toevoegen, ook tussendoor |
| `Get-Log [gisteren\|3-11]` | Log bekijken |
| `Get-Logs` | Overzicht van alle logs |
| `Get-Summary [-Week] [-Days 30]` | AI-samenvatting voor je verslag |
| `Export-Verslag -Format pdf\|word\|md` | Exporteren (`-Week 1`, `-From 1-11 -To 7-11`) |
| `Backup-Logs` / `Restore-Logs` | Backup maken en terugzetten (ook om pc ↔ iPad over te zetten) |
| `Set-Config` | Naam, stage-info en AI instellen |
| `Get-Stats`, `Test-AI`, `cls`, `help` | Statistieken, AI-test, scherm leegmaken, hulp |

## Installeren
1. Zet GitHub Pages aan (Settings → Pages → branch kiezen → `/root`).
2. **iPad:** open de link in Safari → Delen → *Zet op beginscherm*.
3. **PC:** open de link in Chrome of Edge → installeer-icoon in de adresbalk.

Lokaal testen: `python3 -m http.server` en open http://localhost:8000
