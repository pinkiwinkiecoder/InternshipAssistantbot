# StageLog Terminal ❯_

Een stagelogboek voor **podiumtechnieken (licht)** in een terminal-look met PowerShell-sfeer: bewegende spots, haze, een followspot, glitch-effecten en kleurthema's die naar lichtfilters (gels) heten. Je vult alles zelf in, stap voor stap. Een gratis AI kan doorvragen en je spelling en vaktermen nakijken, maar verzint niets.

**Indeling van elke dag (10 stappen):**

```
Datum
◎ Productie · ⌖ Locatie · ◷ Werkuren
◉ Wie is er gekomen
▤ Wat was er te doen (planning)
⚒ Mijn taken                 (verplicht)
◈ Materiaal & techniek
⚠ Wat is er fout gelopen
✦ Wat heb ik geleerd         (verplicht)
➜ Meenemen naar morgen       (verschijnt de volgende dag automatisch)
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
| `Add-Taak` / `Add-Fout` / `Add-Geleerd` / `Add-Morgen` / `Add-Wie` | Snel iets toevoegen, ook tussendoor |
| `Get-Log [gisteren\|3-11]` | Log bekijken |
| `Get-Logs` | Overzicht van alle logs |
| `Get-Summary [-Week] [-Days 30]` | AI-samenvatting voor je verslag |
| `Export-Verslag -Format pdf\|word\|md` | Exporteren (`-Week 1`, `-From 1-11 -To 7-11`) |
| `Backup-Logs` / `Restore-Logs` | Backup maken en terugzetten (ook om pc ↔ iPad over te zetten) |
| `Set-Config` | Naam, opleiding, stageplek, mentor en AI instellen |
| `Set-Theme [congo\|amber\|magenta\|peacock\|red\|uv]` | Kies een gel (kleurthema) |
| `Set-Fx max\|low\|off` | Effecten instellen (low spaart batterij) |
| `Get-Stats`, `Test-AI`, `cls`, `help` | Statistieken, AI-test, scherm leegmaken, hulp |

## Installeren
1. Zet GitHub Pages aan (Settings → Pages → branch kiezen → `/root`).
2. **iPad:** open de link in Safari → Delen → *Zet op beginscherm*.
3. **PC:** open de link in Chrome of Edge → installeer-icoon in de adresbalk.

Lokaal testen: `python3 -m http.server` en open http://localhost:8000
