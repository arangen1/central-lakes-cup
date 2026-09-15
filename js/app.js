/**
 * Main application logic for ski race results
 */

const App = {
    races: [],
    events: [],
    seasons: [],
    selectedSeason: null,
    defaultSeasonId: null,
    seasonLoadId: 0,
    loadingSeason: false,
    seasonError: null,
    currentView: 'home',
    currentEventIndex: null,
    filters: {
        gender: 'M', // Default to Boys - genders always shown separately
        class: null,
        team: null,
        page: 1,
        pageSize: 100
    },

    /**
     * Initialize the application
     */
    async init() {
        this.container = document.getElementById('app');
        this.loadingSeason = true;
        this.setupNavigation();

        Views.renderLoading(this.container);

        try {
            await this.loadSeasons();
            await this.selectSeason(this.seasonFromURL(), { historyMode: 'replace' });
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.loadingSeason = false;
            this.seasonError = 'Season information could not be loaded. Please try again.';
            this.container.setAttribute('aria-busy', 'false');
            Views.renderError(this.container, this.seasonError);
        }
    },

    /**
     * Seasons explicitly own their race manifests; calendar years never split a winter.
     */
    async loadSeasons() {
        const response = await fetch('data/seasons.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error('Could not load seasons.json');
        const catalog = await response.json();
        const seasons = catalog.seasons;
        if (!Array.isArray(seasons) || seasons.length === 0 ||
            seasons.some(season => !season || typeof season.id !== 'string' || !season.id ||
                typeof season.label !== 'string' || !season.label ||
                typeof season.manifest !== 'string' || !season.manifest) ||
            new Set(seasons.map(season => season.id)).size !== seasons.length ||
            !seasons.some(season => season.id === catalog.defaultSeason)) {
            throw new Error('Invalid season catalog');
        }
        this.seasons = seasons;
        this.defaultSeasonId = catalog.defaultSeason;
        Views.renderSeasonOptions(seasons);
    },

    seasonFromURL() {
        const requested = new URL(window.location.href).searchParams.get('season');
        return this.seasons.some(season => season.id === requested) ? requested : this.defaultSeasonId;
    },

    /**
     * Replace all season-scoped data together. A late request cannot overwrite a newer selection.
     */
    async selectSeason(seasonId, { historyMode = 'push' } = {}) {
        const season = this.seasons.find(item => item.id === seasonId);
        if (!season) return;

        const loadId = ++this.seasonLoadId;
        this.selectedSeason = season;
        this.loadingSeason = true;
        this.seasonError = null;
        this.races = [];
        this.events = [];
        this.currentEventIndex = null;
        this.currentView = this.currentView === 'standings' ? 'standings' : 'home';
        this.filters.team = null;
        this.filters.page = 1;
        Views._currentIndividuals = [];
        Views.renderSeasonContext(season, this.defaultSeasonId);

        const url = new URL(window.location.href);
        url.searchParams.set('season', season.id);
        if (historyMode === 'replace') {
            window.history.replaceState(null, '', url);
        } else if (historyMode === 'push' && url.href !== window.location.href) {
            window.history.pushState(null, '', url);
        }
        this.container.setAttribute('aria-busy', 'true');
        this.navigate(this.currentView);

        try {
            const races = await this.loadRaces(season);
            if (loadId !== this.seasonLoadId) return;
            this.races = races;
            this.events = this.groupRacesIntoEvents(races);
        } catch (error) {
            if (loadId !== this.seasonLoadId) return;
            console.error(`Failed to load season ${season.id}:`, error);
            this.seasonError = `Results for ${season.label} could not be loaded completely. Please retry or choose another season.`;
        }
        if (loadId !== this.seasonLoadId) return;
        this.loadingSeason = false;
        this.container.setAttribute('aria-busy', 'false');
        this.navigate(this.currentView);
    },

    /**
     * Race files live in the races/ folder next to that season's manifest.
     * Reject incomplete loads so partial totals are never presented as final standings.
     */
    async loadRaces(season) {
        const manifestURL = new URL(`data/${season.manifest}`, document.baseURI);
        const manifestResponse = await fetch(manifestURL, { cache: 'no-cache' });
        if (!manifestResponse.ok) {
            throw new Error(`Could not load ${season.manifest}`);
        }

        const manifest = await manifestResponse.json();
        if (!Array.isArray(manifest.races) ||
            manifest.races.some(file => typeof file !== 'string' || !file.trim()) ||
            new Set(manifest.races).size !== manifest.races.length) {
            throw new Error('Invalid race manifest');
        }

        const racePromises = manifest.races.map(async (raceFile) => {
            const raceURL = new URL(`races/${encodeURIComponent(raceFile)}`, manifestURL);
            const response = await fetch(raceURL);
            if (!response.ok) throw new Error(`Could not load race file: ${raceFile}`);
            const raceData = XMLParser.parseRace(await response.text());
            raceData.filename = raceFile;
            return raceData;
        });

        const races = await Promise.all(racePromises);
        return races.sort((a, b) => {
            const dateA = new Date(a.header.date || 0);
            const dateB = new Date(b.header.date || 0);
            return dateB - dateA;
        });
    },

    /**
     * Strip gender prefix from event name
     */
    stripGenderFromName(name) {
        if (!name) return name;
        // Remove "Boys " or "Girls " prefix
        return name.replace(/^(Boys|Girls)\s+/i, '').trim();
    },

    /**
     * Group races by date into single events
     * Races on the same date are combined into one event
     */
    groupRacesIntoEvents(races) {
        const eventsByDate = {};

        races.forEach(race => {
            const date = race.header.date || 'unknown';
            if (!eventsByDate[date]) {
                eventsByDate[date] = {
                    date: date,
                    races: [],
                    name: this.stripGenderFromName(race.header.name),
                    location: race.header.location,
                    discipline: race.header.discipline
                };
            }
            eventsByDate[date].races.push(race);

            // Use the more descriptive name if available (after stripping gender)
            const strippedName = this.stripGenderFromName(race.header.name);
            if (strippedName && strippedName.length > (eventsByDate[date].name || '').length) {
                eventsByDate[date].name = strippedName;
            }
            if (race.header.location && !eventsByDate[date].location) {
                eventsByDate[date].location = race.header.location;
            }
        });

        // Convert to array and sort by date (newest first)
        return Object.values(eventsByDate).sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
        });
    },

    /**
     * Get combined racers from all races in an event
     */
    getEventRacers(event) {
        const allRacers = [];
        const seen = new Set();

        event.races.forEach(race => {
            race.racers.forEach(racer => {
                // Create unique key for racer
                const key = `${racer.bib}_${racer.firstName}_${racer.lastName}_${racer.team}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    allRacers.push(racer);
                }
            });
        });

        return allRacers;
    },

    /**
     * Set up navigation event listeners
     */
    setupNavigation() {
        document.getElementById('season-select').addEventListener('change', (e) => {
            this.selectSeason(e.target.value);
        });
        window.addEventListener('popstate', () => {
            if (this.seasons.length) {
                this.selectSeason(this.seasonFromURL(), { historyMode: 'replace' });
            }
        });

        // Nav links
        document.querySelectorAll('[data-nav]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.target.dataset.nav;
                this.navigate(view);
            });
        });

        // Event delegation for dynamic elements
        this.container.addEventListener('click', (e) => {
            // Event card clicks
            const eventCard = e.target.closest('.event-card');
            if (eventCard) {
                const index = parseInt(eventCard.dataset.eventIndex);
                this.showEvent(index);
                return;
            }

            // Back button
            if (e.target.dataset.action === 'back') {
                this.navigate('home');
                return;
            }

            // Tab switching
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn) {
                this.switchTab(tabBtn.dataset.tab);
                return;
            }

            // Gender tab switching
            const genderTab = e.target.closest('.gender-tab');
            if (genderTab) {
                this.filters.gender = genderTab.dataset.gender;
                this.filters.page = 1; // Reset to page 1 on gender change
                this.filters.team = null; // Reset team filter on gender change
                this.refreshCurrentView();
                return;
            }

            // Pagination button clicks
            const pageBtn = e.target.closest('.page-btn');
            if (pageBtn && !pageBtn.disabled) {
                const newPage = parseInt(pageBtn.dataset.page);
                if (newPage && newPage > 0) {
                    this.filters.page = newPage;
                    this.refreshCurrentView();
                }
                return;
            }
        });

        // Filter changes
        this.container.addEventListener('change', (e) => {
            if (e.target.id === 'class-filter') {
                this.filters.class = e.target.value || null;
                this.filters.page = 1; // Reset to page 1 on class change
                this.refreshCurrentView();
            }
            if (e.target.id === 'team-filter') {
                this.filters.team = e.target.value || null;
                this.refreshCurrentView();
            }
            if (e.target.id === 'page-size-select') {
                const value = e.target.value;
                this.filters.pageSize = value === 'all' ? 10000 : parseInt(value);
                this.filters.page = 1; // Reset to page 1 on page size change
                this.refreshCurrentView();
            }
        });

        // Athlete search
        this.container.addEventListener('input', (e) => {
            if (e.target.id === 'athlete-search') {
                this.handleAthleteSearch(e.target.value);
            }
        });
    },

    /**
     * Search for athletes by name
     */
    handleAthleteSearch(query) {
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;

        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        const searchResults = this.searchAthletes(query);
        resultsContainer.innerHTML = Views.renderAthleteSearchResults(searchResults);
    },

    /**
     * Search athletes across all events
     * Properly calculates points/places using the Scoring module
     * Returns actual season rank among ALL athletes, not just search results
     */
    searchAthletes(query) {
        const normalizedQuery = query.toLowerCase().trim();
        const allAthleteMap = {};

        // First, build complete athlete data for ALL athletes (needed for accurate season rank)
        this.events.forEach(event => {
            // Combine racers from all race files in this event
            const allRacers = [];
            event.races.forEach(race => {
                race.racers.forEach(racer => {
                    allRacers.push({...racer});
                });
            });

            // Calculate individual results for both genders
            ['M', 'F'].forEach(gender => {
                const results = Scoring.calculateIndividualResults(allRacers, gender);

                results.forEach(racer => {
                    const key = `${racer.firstName}_${racer.lastName}_${racer.team}_${racer.gender}`;
                    if (!allAthleteMap[key]) {
                        allAthleteMap[key] = {
                            firstName: racer.firstName,
                            lastName: racer.lastName,
                            team: racer.team,
                            gender: racer.gender,
                            class: racer.class,
                            eventResults: []
                        };
                    }

                    // Only add if not already added for this event
                    const alreadyAdded = allAthleteMap[key].eventResults.some(
                        r => r.eventDate === event.date
                    );
                    if (!alreadyAdded) {
                        allAthleteMap[key].eventResults.push({
                            eventName: event.name,
                            eventDate: event.date,
                            place: racer.place,
                            points: racer.points || 0,
                            totalTime: racer.totalTime
                        });
                    }
                });
            });
        });

        // Calculate season totals with proper drop logic for ALL athletes
        const totalEvents = this.events.length;
        const allAthletes = Object.values(allAthleteMap);
        allAthletes.forEach(athlete => {
            // Sort by points descending to determine drop
            const sortedByPoints = [...athlete.eventResults].sort((a, b) => b.points - a.points);

            // Only drop if participated in ALL events
            const shouldDrop = sortedByPoints.length >= totalEvents && totalEvents > 1;
            if (shouldDrop) {
                // Mark the lowest scoring event as dropped
                const droppedDate = sortedByPoints[sortedByPoints.length - 1].eventDate;
                athlete.eventResults.forEach(r => {
                    r.dropped = (r.eventDate === droppedDate);
                });
            }

            // Calculate total (excluding dropped)
            athlete.totalPoints = athlete.eventResults
                .filter(r => !r.dropped)
                .reduce((sum, r) => sum + r.points, 0);
        });

        // Calculate season rank among ALL athletes of same gender
        const genderGroups = {};
        allAthletes.forEach(a => {
            if (!genderGroups[a.gender]) genderGroups[a.gender] = [];
            genderGroups[a.gender].push(a);
        });

        Object.values(genderGroups).forEach(group => {
            group.sort((a, b) => b.totalPoints - a.totalPoints);
            group.forEach((athlete, index) => {
                athlete.seasonRank = index + 1;
            });
        });

        // Now filter to only athletes matching the search query
        const matchingAthletes = allAthletes.filter(athlete => {
            const fullName = `${athlete.firstName} ${athlete.lastName}`.toLowerCase();
            return fullName.includes(normalizedQuery);
        });

        // Sort event results by date (newest first) for display
        matchingAthletes.forEach(athlete => {
            athlete.eventResults.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
        });

        // Sort search results by total points
        matchingAthletes.sort((a, b) => b.totalPoints - a.totalPoints);

        return matchingAthletes.slice(0, 10); // Limit results
    },

    /**
     * Navigate to a view
     */
    navigate(view) {
        this.currentView = view;
        this.updateNavActive(view);
        if (this.loadingSeason) {
            Views.renderLoading(this.container);
            return;
        }
        if (this.seasonError) {
            Views.renderError(this.container, this.seasonError);
            return;
        }

        switch (view) {
            case 'home':
                this.currentEventIndex = null;
                Views.renderEventList(this.events, this.container, this.selectedSeason, this.seasons, this.defaultSeasonId);
                break;
            case 'standings':
                this.currentEventIndex = null;
                Views.renderSeasonStandings(this.events, this.container, this.filters, this.selectedSeason, this.seasons, this.defaultSeasonId);
                break;
            default:
                Views.renderEventList(this.events, this.container, this.selectedSeason, this.seasons, this.defaultSeasonId);
        }
    },

    /**
     * Show a specific event (may contain multiple race files)
     */
    showEvent(index) {
        this.currentView = 'event';
        this.currentEventIndex = index;
        const event = this.events[index];

        if (event) {
            // Combine racers from all race files in this event
            const combinedRacers = this.getEventRacers(event);
            const eventData = {
                header: {
                    name: event.name,
                    date: event.date,
                    location: event.location,
                    discipline: event.discipline
                },
                racers: combinedRacers
            };
            Views.renderRaceResults(eventData, this.container, this.filters);
        }
    },

    /**
     * Refresh the current view (after filter change)
     */
    refreshCurrentView() {
        if (this.currentView === 'event' && this.currentEventIndex !== null) {
            this.showEvent(this.currentEventIndex);
        } else if (this.currentView === 'standings') {
            this.navigate('standings');
        }
    },

    /**
     * Switch between tabs
     */
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', !content.id.startsWith(tabName));
        });
    },

    /**
     * Update active nav state
     */
    updateNavActive(view) {
        document.querySelectorAll('[data-nav]').forEach(link => {
            link.classList.toggle('active', link.dataset.nav === view);
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
