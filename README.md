# Alpine Ski Race Results

A static website to display alpine ski race results from XML timing files, with team scoring based on Minnesota high school league rules.

## Features

- **Individual Race Results**: View race results with times, places, and points
- **Team Standings**: Automatic team scoring (top 4 finishers per team)
- **Season Standings**: Cumulative points across all races
- **Filtering**: Filter by gender (Boys/Girls) and class (Varsity/JV)
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Print-Friendly**: Clean print layout for posting results

## Scoring System

- **Points by Place**: 1st place = 100 points, 2nd = 99, 3rd = 98, etc.
- **Team Scoring**: Sum of top 4 finishers' points per team
- **Separate Divisions**: Boys Varsity, Girls Varsity, Boys JV, Girls JV

## Adding Race Results

### Step 1: Export XML from Split Second

After timing a race with Split Second software, export the results as XML.

### Step 2: Add the XML File

1. Copy your XML file to the `data/races/` folder
2. Give it a descriptive filename (e.g., `2024-01-15-buck-hill-gs.xml`)

### Step 3: Update the Manifest

Edit `data/races.json` and add your filename to the `races` array:

```json
{
    "races": [
        "2024-01-15-buck-hill-gs.xml",
        "2024-01-22-afton-slalom.xml"
    ]
}
```

### Step 4: Commit and Push

If hosted on GitHub Pages:

```bash
git add data/races/your-race.xml data/races.json
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
cd ski-results
python3 -m http.server 8000
# Open http://localhost:8000
```

Using Node.js:
```bash
npx serve ski-results
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
ski-results/
├── index.html              # Main page
├── css/
│   └── styles.css          # All styling
├── js/
│   ├── app.js              # Main application logic
│   ├── xmlParser.js        # XML parsing
│   ├── scoring.js          # Scoring calculations
│   └── views.js            # UI rendering
├── data/
│   ├── races.json          # Race file manifest
│   └── races/              # XML race files
│       └── *.xml
└── README.md
```

## Troubleshooting

### Race not showing up?

1. Check that the filename is listed in `data/races.json`
2. Verify the XML file is valid (no syntax errors)
3. Check browser console for error messages

### Scores seem wrong?

1. Verify racers have correct Gender (`M`/`F`) and Class (`Varsity`/`JV`)
2. Make sure Team names are consistent across races
3. Check that times are in correct format (seconds or MM:SS.ss)

### Site not updating after push?

GitHub Pages can take a few minutes to deploy. Check the "Actions" tab in your repository for build status.
