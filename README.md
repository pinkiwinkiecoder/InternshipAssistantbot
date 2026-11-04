# StageLog Terminal ❯_

Een stagelogboek voor **podiumtechnieken (licht)** in een terminal-look met PowerShell-sfeer: bewegende spots, haze, een followspot, glitch-effecten en kleurthema's die naar lichtfilters (gels) heten.
Je vult alles zelf in, stap voor stap. Op het einde exporteer je een **mooi opgemaakt Word-document** met voorpagina, overzicht, één pagina per dag, urenoverzicht en handtekeningen.

## Indeling van elke dag (10 stappen)

```
Datum
◎ Productie · ⌖ Locatie · ◷ Werkuren      (productie/locatie worden onthouden, uren automatisch berekend)
◉ Wie is er gekomen
▤ Wat was er te doen (planning)
⚒ Mijn taken                 (verplicht)
◈ Materiaal & techniek
⚠ Wat is er fout gelopen
✦ Wat heb ik geleerd         (verplicht)
➜ Meenemen naar morgen       (verschijnt de volgende dag automatisch)
```

Sluit je de app halverwege? Je concept wordt na elke stap bewaard. Typ later gewoon `New-Log` om verder te gaan.

## Installeren (gratis)

1. GitHub → deze repo → **Settings → Pages** → *Source: Deploy from a branch* → branch `claude/stagelog-terminal`, map `/ (root)` → **Save**.
2. Na ± 1 minuut staat de app op `https://<jouw-gebruikersnaam>.github.io/InternshipAssistantbot/`.
3. **iPad:** open die link in Safari → Delen → *Zet op beginscherm*.
4. **PC:** open de link in Chrome of Edge → installeer-icoon in de adresbalk.

De app werkt daarna ook offline.

## Gratis AI (optioneel)

Typ `Set-Config` en kies:
- **Google Gemini**: gratis sleutel via https://aistudio.google.com/apikey (aanrader)
- **Groq**: gratis sleutel via https://console.groq.com/keys

De AI verzint niets. Hij stelt doorvragen ("welke lichttafel?", "wat was de oorzaak?"), waarschuwt voor dagboekzinnen en verbetert spelling en vaktermen. Je kan altijd je eigen versie bewaren. Verdwijnt een AI-model, dan schakelt de app zelf over op een ander.

> ⚠️ Gratis AI-diensten mogen je tekst soms gebruiken om te trainen. Zet er geen vertrouwelijke info, wachtwoorden of namen van klanten in.

## Commando's

| Commando | Wat het doet |
|---|---|
| `New-Log` | Je log van vandaag invullen (`New-Log gisteren`, `New-Log 3-11`) |
| `Add-Taak` · `Add-Fout` · `Add-Geleerd` · `Add-Morgen` · `Add-Wie` | Snel iets toevoegen, ook tussendoor |
| `Edit-Log` | Een log achteraf aanpassen: items wijzigen, toevoegen of verwijderen |
| `Get-Log` · `Get-Logs` | Eén dag of het overzicht van alle dagen (met uren) bekijken |
| `Find-Log dimmer` | Zoeken in al je logs |
| `Get-Stats` | Statistieken, streak, uren en producties |
| `Get-Summary` | AI-samenvatting (`-Week`, `-Days 30`) |
| `Export-Verslag` | **Word (.docx)**, PDF of Markdown, voor alles, een week, een maand of een eigen periode |
| `Backup-Logs` · `Restore-Logs` | Backup maken en terugzetten (ook om pc ↔ iPad over te zetten) |
| `Set-Config` | Naam, opleiding, stageplek, mentor en AI |
| `Set-Theme` | Kies een gel: congo · amber · magenta · peacock · red · uv |
| `Set-Fx max\|low\|off` | Effecten (low spaart batterij) |
| `help` | Alles op een rij |

**Tab** vult aan · **↑↓** geeft vorige commando's · **Ctrl+C** breekt af · op de iPad staan alle knoppen onderaan.

## Belangrijk: je gegevens

Je logs staan **alleen op het apparaat** waarop je ze schrijft (in de browser). Maak dus af en toe een `Backup-Logs` en bewaar dat bestand in iCloud Drive of OneDrive. De app herinnert je eraan.

## Lokaal testen

```
python3 -m http.server 8000
```
Open daarna http://localhost:8000
