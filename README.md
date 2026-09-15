# Central Lakes Cup

A static website to display alpine ski race results from XML timing files, with team scoring based on Minnesota high school league rules.

## Features

- **Individual Race Results**: View race results with times, places, and points
- **Team Standings**: Automatic team scoring (top 4 finishers per team)
- **Season Standings**: Cumulative points across all races
- **Season History**: Separate races, athlete searches, and standings for each winter season
- **Filtering**: Filter by gender (Boys/Girls) and class (Varsity/JV)
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Print-Friendly**: Clean print layout for posting results

## Scoring System

- **Points by Place**: 1st place = 100 points, 2nd = 99, 3rd = 98, etc.
- **Team Scoring**: Sum of top 4 finishers' points per team
- **Separate Divisions**: Boys Varsity, Girls Varsity, Boys JV, Girls JV

## Seasons and historical records

The site opens **2026/2027** by default. Use **Choose a season** above
the results to open **2025/2026** or any future season. The selection
applies to race events, athlete searches, individual standings, and team standings.
The season stays in the page address when you refresh or share a link:

- Current season: `?season=2026-2027`
- Historical season: `?season=2025-2026`

Each season has its own race manifest. A winter spanning December and January
is one season; the app does not split results by calendar year. Only the selected
season's races count toward standings and dropped results.

`data/seasons.json` lists the seasons and chooses the current one with
`defaultSeason`. Its manifest paths are relative to `data/`. Each manifest's
XML files live in a `races/` folder beside it.

| Season | Manifest | XML folder |
| --- | --- | --- |
| 2025/2026 | `data/races.json` | `data/races/` |
| 2026/2027 | `data/seasons/2026-2027/races.json` | `data/seasons/2026-2027/races/` |

The 2025/2026 season's original manifest and all six XML files are retained unchanged.
The 2026/2027 season starts with no races. Completed seasons remain available in the selector;
keep their entries, manifests, and XML files when opening a new year. Archives
use the existing scoring rules. If scoring rules change in a future year, version
those rules by season as part of that change so historical totals stay consistent.

### Opening 2027/2028 and later seasons

1. Create `data/seasons/2027-2028/races.json` containing `{ "races": [] }`
   and a neighboring `races/` folder.
2. Add this entry at the beginning of the `seasons` array in `data/seasons.json`:

   ```json
   {
       "id": "2027-2028",
       "label": "2027/2028",
       "manifest": "seasons/2027-2028/races.json"
   }
   ```

3. Set `defaultSeason` to `"2027-2028"`. Keep all prior entries and files.

No application code changes are needed to add another season. Season IDs must be
unique, and `defaultSeason` must match an entry.

## Adding race results to 2026/2027

### Step 1: Export XML from Split Second

After timing a race with Split Second software, export the results as XML.

### Step 2: Add the XML File

1. Copy your XML file to `data/seasons/2026-2027/races/`.
2. Give it a descriptive filename (e.g., `2027-01-15-buck-hill-gs.xml`).

### Step 3: Update the Manifest

Edit `data/seasons/2026-2027/races.json` and add your filename to the `races`
array. Append it alongside any existing entries:

```json
{
    "races": [
        "2027-01-15-buck-hill-gs.xml",
        "2027-01-22-afton-slalom.xml"
    ]
}
```

### Step 4: Commit and Push

If hosted on GitHub Pages:

```bash
git add data/seasons/2026-2027/
git commit -m "Add race results from [date]"
git push
```

The site will automatically update within a few minutes.

## XML File Format

The site expects XML files from Split Second timing software with this structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Race>
    <Header>
        <Name>Race Name</Name>
        <Date>2024-01-15</Date>
        <Location>Ski Area Name</Location>
        <Discipline>GS</Discipline>
    </Header>

    <Comp Id="1" Bib="1">
        <Firstname>John</Firstname>
        <Lastname>Smith</Lastname>
        <Class>Varsity</Class>
        <Team>Team Name</Team>
        <Gender>M</Gender>
    </Comp>

    <Time Comp="1" Course="1">
        <Time>32.45</Time>
        <Status>OK</Status>
        <Run>1</Run>
    </Time>
</Race>
```

### Required Fields

- **Comp**: Racer entries with Id, Firstname, Lastname, Gender, Team, Class
- **Time**: Time entries linked to Comp by Id, with Time value and Run number
- **Gender**: `M` for male, `F` for female
- **Class**: `Varsity` or `JV`

## Hosting on GitHub Pages

1. Create a new GitHub repository
2. Push this code to the repository
3. Go to Settings > Pages
4. Select "Deploy from a branch" and choose `main` (or `master`)
5. Your site will be available at `https://[username].github.io/[repo-name]/`

## Embedding in Weebly

Add this HTML to a Weebly page using the "Embed Code" element:

```html
<iframe
    src="https://[username].github.io/[repo-name]/"
    width="100%"
    height="800"
    frameborder="0"
    style="border: none;">
</iframe>
```

## Local Development

To run locally, you need a web server (browsers block local file loading for security).

Using Python:
```bash
cd central-lakes-cup
python3 -m http.server 8000 --bind 127.0.0.1
# Open http://localhost:8000
```

Using Node.js:
```bash
npx serve central-lakes-cup
```

Run the season regression checks with Node.js (no dependencies to install):

```bash
node --test tests/seasons.test.js
```

## Customization

### Colors

Edit the CSS variables at the top of `css/styles.css`:

```css
:root {
    --primary-color: #1a365d;    /* Header/accent color */
    --secondary-color: #4299e1;  /* Links/highlights */
    --accent-color: #ed8936;     /* Points/emphasis */
}
```

### Team Scoring

To change the number of scoring racers per team, edit `js/scoring.js`:

```javascript
// In calculateTeamStandings function
const topN = 4; // Change this number
```

## File Structure

```
central-lakes-cup/
├── index.html              # Main page
├── css/
│   └── styles.css          # All styling
├── js/
│   ├── app.js              # Main application logic
│   ├── xmlParser.js        # XML parsing
│   ├── scoring.js          # Scoring calculations
│   └── views.js            # UI rendering
├── data/
│   ├── seasons.json        # Season catalog and default season
│   ├── races.json          # Preserved 2025/2026 manifest
│   ├── races/              # Preserved 2025/2026 XML files
│   │   └── *.xml
│   └── seasons/
│       └── 2026-2027/
│           ├── races.json  # 2026/2027 manifest
│           └── races/      # 2026/2027 XML files
├── tests/
│   └── seasons.test.js     # Season isolation and loading regression checks
└── README.md
```

## Troubleshooting

### Race not showing up?

1. Choose the correct season and check its manifest for the exact filename.
2. Verify the XML file is valid (no syntax errors)
3. Check browser console for error messages

If any listed race cannot be loaded or parsed, the site shows an error instead
of incomplete standings. Correct that season's file or manifest and retry.

### Scores seem wrong?

1. Verify racers have correct Gender (`M`/`F`) and Class (`Varsity`/`JV`)
2. Make sure Team names are consistent across races
3. Check that times are in correct format (seconds or MM:SS.ss)

### Site not updating after push?

GitHub Pages can take a few minutes to deploy. Check the "Actions" tab in your repository for build status.
