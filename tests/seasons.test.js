const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/seasons.json')));
const oldId = '2025-2026';
const currentId = '2026-2027';
const oldManifest = 'data/races.json';
const currentManifest = 'data/seasons/2026-2027/races.json';
const clone = value => JSON.parse(JSON.stringify(value));

function race(name, date, athletes = ['Alex']) {
    return {
        header: { name, date, location: 'Test hill', discipline: 'SL' },
        racers: athletes.map((firstName, index) => ({
            bib: String(index + 1), firstName, lastName: 'Skier',
            team: 'Brainerd', gender: 'M', class: 'Varsity',
            run1: 30000 + index * 1000, run2: 30000,
            totalTime: 60000 + index * 1000, dnf: false, dsq: false
        }))
    };
}

function resources(withCurrentRaces = false) {
    return {
        'data/seasons.json': catalog,
        [oldManifest]: { races: ['December.xml', 'January.xml'] },
        'data/races/December.xml': race('First winter December', '2025-12-22'),
        'data/races/January.xml': race('First winter January', '2026-01-15'),
        [currentManifest]: { races: withCurrentRaces ? ['December.xml', 'January.xml'] : [] },
        'data/seasons/2026-2027/races/December.xml': race('Second winter December', '2026-12-22', ['Alex', 'Sam']),
        'data/seasons/2026-2027/races/January.xml': race('Second winter January', '2027-01-15', ['Alex', 'Sam'])
    };
}

// Run the production app, views, and scoring without installing a browser library.
// Only browser APIs and XML decoding are substituted; races are independent fixtures.
function appHarness({ url = 'http://localhost/', files = resources(), intercept } = {}) {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            innerHTML: '', textContent: '', value: '', hidden: true, attributes: {}, listeners: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(type, handler) { this.listeners[type] = handler; }
        });
        return elements.get(id);
    }
    const browserEvents = {};
    const location = { href: url };
    const history = {
        pushState(_state, _unused, value) { location.href = String(value); },
        replaceState(_state, _unused, value) { location.href = String(value); }
    };
    const base = new URL('.', url);
    const requests = [];
    const context = vm.createContext({
        URL,
        console: { error() {} },
        document: {
            baseURI: url,
            getElementById: element,
            querySelectorAll: () => [],
            addEventListener() {}
        },
        window: { location, history, addEventListener(type, handler) { browserEvents[type] = handler; } },
        XMLParser: { parseRace: JSON.parse },
        async fetch(input) {
            const resolved = new URL(input, base);
            assert.ok(resolved.pathname.startsWith(base.pathname), 'requests stay inside the site path');
            const file = decodeURIComponent(resolved.pathname.slice(base.pathname.length));
            requests.push(file);
            if (intercept) await intercept(file);
            const data = files[file];
            return { ok: data !== undefined, json: async () => clone(data), text: async () => JSON.stringify(data) };
        }
    });
    for (const file of ['scoring.js', 'views.js', 'app.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
    }
    const app = vm.runInContext('App', context);
    const scoring = vm.runInContext('Scoring', context);
    return { app, scoring, element, requests, location, browserEvents, files };
}

test('the catalog preserves all six historical files and starts the current season empty', () => {
    assert.equal(catalog.defaultSeason, currentId);
    const manifests = catalog.seasons.map(season => {
        const filename = path.join(root, 'data', season.manifest);
        const manifest = JSON.parse(fs.readFileSync(filename));
        for (const raceFile of manifest.races) {
            assert.ok(fs.existsSync(path.join(path.dirname(filename), 'races', raceFile)));
        }
        return manifest;
    });
    assert.equal(manifests[catalog.seasons.findIndex(s => s.id === oldId)].races.length, 6);
    assert.deepEqual(manifests[catalog.seasons.findIndex(s => s.id === currentId)].races, []);
});

test('first visit opens the current season without loading historical races or totals', async () => {
    const h = appHarness();
    await h.app.init();
    assert.equal(h.app.selectedSeason.id, currentId);
    assert.equal(h.app.races.length, 0);
    assert.equal(h.app.searchAthletes('Alex').length, 0);
    assert.match(h.element('app').innerHTML, /No race results yet/);
    assert.match(h.element('app').innerHTML, /\?season=2025-2026/);
    assert.ok(!h.requests.includes(oldManifest));
    h.app.navigate('standings');
    assert.match(h.element('app').innerHTML, /Standings will appear after the first race/);
    assert.doesNotMatch(h.element('app').innerHTML, /1 dropped|NaN|undefined/);
});

test('archive links and reloads retain the historical season under a GitHub Pages subpath', async () => {
    const h = appHarness({ url: `http://localhost/central-lakes-cup/?season=${oldId}` });
    await h.app.init();
    assert.equal(h.app.selectedSeason.id, oldId);
    assert.equal(h.app.races.length, 2);
    assert.equal(h.app.events.length, 2, 'December and January remain in one season');
    assert.match(h.element('app').innerHTML, /2025\/2026 only/);
    assert.match(h.element('season-status').textContent, /Historical/);
    assert.ok(!h.requests.includes(currentManifest));
    const reloaded = appHarness({ url: h.location.href });
    await reloaded.app.init();
    assert.equal(reloaded.app.selectedSeason.id, oldId);
});

test('athlete search, team totals and dropped results use only the selected winter', async () => {
    const h = appHarness({ files: resources(true), url: `http://localhost/?season=${oldId}` });
    await h.app.init();
    const firstWinter = clone(h.scoring.calculateSeasonStandings(h.app.events, 'M'));
    assert.equal(firstWinter.eventCount, 2);
    assert.equal(firstWinter.individuals[0].totalPoints, 1);
    assert.equal(firstWinter.teams[0].totalPoints, 1);
    h.app.filters.team = 'Old team';
    h.app.filters.page = 8;
    h.app.showEvent(0);
    await h.app.selectSeason(currentId);
    assert.equal(h.app.currentView, 'home');
    assert.equal(h.app.currentEventIndex, null);
    assert.equal(h.app.filters.team, null);
    assert.equal(h.app.filters.page, 1);
    const secondWinter = h.scoring.calculateSeasonStandings(h.app.events, 'M');
    assert.equal(secondWinter.eventCount, 2);
    assert.equal(secondWinter.individuals[0].totalPoints, 2);
    assert.equal(secondWinter.teams[0].totalPoints, 3);
    assert.equal(secondWinter.individuals[0].droppedResult.points, 2);
    assert.equal(h.app.searchAthletes('Alex')[0].totalPoints, 2);
    assert.equal(h.app.searchAthletes('Sam').length, 1);
    assert.ok(h.app.searchAthletes('Alex')[0].eventResults.every(r => r.eventName.startsWith('Second winter')));
    h.app.navigate('standings');
    await h.app.selectSeason(oldId);
    assert.equal(h.app.currentView, 'standings');
    assert.deepEqual(clone(h.scoring.calculateSeasonStandings(h.app.events, 'M')), firstWinter);
    assert.equal(h.app.searchAthletes('Sam').length, 0);
    assert.doesNotMatch(h.element('app').innerHTML, /Second winter/);
});

test('switching from archive standings to an empty season clears previous results', async () => {
    const h = appHarness({ url: `http://localhost/?season=${oldId}` });
    await h.app.init();
    h.app.navigate('standings');
    assert.match(h.element('app').innerHTML, /Alex/);
    await h.app.selectSeason(currentId);
    assert.match(h.element('app').innerHTML, /Standings will appear/);
    assert.doesNotMatch(h.element('app').innerHTML, /Alex|Brainerd/);
    assert.equal(h.app.searchAthletes('Alex').length, 0);
});

test('a slower earlier selection cannot replace the latest season', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const h = appHarness({ intercept: file => file === oldManifest ? gate : undefined });
    await h.app.init();
    const oldRequest = h.app.selectSeason(oldId);
    h.app.navigate('standings');
    assert.match(h.element('app').innerHTML, /Loading race data/);
    await h.app.selectSeason(currentId);
    release();
    await oldRequest;
    assert.equal(h.app.selectedSeason.id, currentId);
    assert.equal(h.app.events.length, 0);
    assert.match(h.element('app').innerHTML, /Standings will appear/);
    assert.equal(h.element('app').attributes['aria-busy'], 'false');
});

test('navigation waits for the initial season catalog instead of rendering an unknown season', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const h = appHarness({ intercept: file => file === 'data/seasons.json' ? gate : undefined });
    const initializing = h.app.init();
    h.app.navigate('standings');
    assert.match(h.element('app').innerHTML, /Loading race data/);
    release();
    await initializing;
    assert.equal(h.app.currentView, 'standings');
    assert.match(h.element('app').innerHTML, /Standings will appear/);
});

test('missing or malformed races show an error, never partial standings', async () => {
    for (const badRace of [undefined, 'invalid race data']) {
        const files = resources();
        files['data/races/January.xml'] = badRace;
        const h = appHarness({ files });
        await h.app.init();
        await h.app.selectSeason(oldId);
        assert.match(h.element('app').innerHTML, /could not be loaded completely/);
        assert.equal(h.app.events.length, 0);
        h.app.navigate('standings');
        assert.match(h.element('app').innerHTML, /could not be loaded completely/);
        await h.app.selectSeason(currentId);
        assert.equal(h.app.seasonError, null);
        assert.match(h.element('app').innerHTML, /Standings will appear/);
    }
});

test('unknown season links fall back to the current season and back navigation loads history', async () => {
    const h = appHarness({ url: 'http://localhost/?season=missing' });
    await h.app.init();
    assert.equal(h.app.selectedSeason.id, currentId);
    assert.equal(new URL(h.location.href).searchParams.get('season'), currentId);
    h.location.href = `http://localhost/?season=${oldId}`;
    h.browserEvents.popstate();
    // The listener starts a request; wait for the same asynchronous fetch pipeline.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.app.selectedSeason.id, oldId);
    assert.equal(h.app.events.length, 2);
});

test('bad catalogs and duplicate race entries cannot produce misleading totals', async () => {
    const files = resources();
    files['data/seasons.json'] = { ...catalog, defaultSeason: 'missing' };
    const h = appHarness({ files });
    await h.app.init();
    assert.match(h.element('app').innerHTML, /Season information could not be loaded/);

    const duplicates = resources();
    duplicates[oldManifest] = { races: ['December.xml', 'December.xml'] };
    const d = appHarness({ files: duplicates, url: `http://localhost/?season=${oldId}` });
    await d.app.init();
    assert.match(d.element('app').innerHTML, /could not be loaded completely/);
    assert.equal(d.app.events.length, 0);
});

test('another season can be added through data only and filenames with spaces load', async () => {
    const files = resources();
    files['data/seasons.json'] = clone(catalog);
    files['data/seasons.json'].defaultSeason = '2027-2028';
    files['data/seasons.json'].seasons.unshift({
        id: '2027-2028', label: '2027/2028', manifest: 'seasons/2027-2028/races.json'
    });
    files['data/seasons/2027-2028/races.json'] = { races: ['Opening Race #1.xml'] };
    files['data/seasons/2027-2028/races/Opening Race #1.xml'] = race('Third winter', '2028-01-15');
    const h = appHarness({ files });
    await h.app.init();
    assert.equal(h.app.selectedSeason.id, '2027-2028');
    assert.equal(h.app.events.length, 1);
    assert.equal(h.app.events[0].name, 'Third winter');
    h.app.navigate('standings');
    assert.match(h.element('app').innerHTML, /no results dropped/);
    await h.app.selectSeason(oldId);
    assert.equal(h.app.events.length, 2);
});
