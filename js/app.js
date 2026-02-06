/**
 * Main application logic for ski race results
 */

const App = {
    races: [],
    currentView: 'home',
    currentRaceIndex: null,
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
        this.setupNavigation();

        Views.renderLoading(this.container);

        try {
            await this.loadRaces();
            this.navigate('home');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            Views.renderError(this.container, 'Failed to load race data. ' + error.message);
        }
    },

    /**
     * Load all races from the manifest
     */
    async loadRaces() {
        // Fetch the race manifest
        const manifestResponse = await fetch('data/races.json');
        if (!manifestResponse.ok) {
            throw new Error('Could not load races.json manifest');
        }

        const manifest = await manifestResponse.json();

        // Fetch and parse each race file
        const racePromises = manifest.races.map(async (raceFile) => {
            try {
                const response = await fetch(`data/races/${encodeURIComponent(raceFile)}`);
                if (!response.ok) {
                    console.warn(`Could not load race file: ${raceFile}`);
                    return null;
                }
                const xmlText = await response.text();
                const raceData = XMLParser.parseRace(xmlText);
                raceData.filename = raceFile;
                return raceData;
            } catch (error) {
                console.warn(`Error parsing race file ${raceFile}:`, error);
                return null;
            }
        });

        const results = await Promise.all(racePromises);
        this.races = results.filter(r => r !== null);

        // Sort races by date (newest first)
        this.races.sort((a, b) => {
            const dateA = new Date(a.header.date || 0);
            const dateB = new Date(b.header.date || 0);
            return dateB - dateA;
        });

        // Group races by date into events
        this.events = this.groupRacesIntoEvents(this.races);
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

        switch (view) {
            case 'home':
                this.currentEventIndex = null;
                Views.renderEventList(this.events, this.container);
                break;
            case 'standings':
                this.currentEventIndex = null;
                Views.renderSeasonStandings(this.events, this.container, this.filters);
                break;
            default:
                Views.renderEventList(this.events, this.container);
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
            Views.renderSeasonStandings(this.events, this.container, this.filters);
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
