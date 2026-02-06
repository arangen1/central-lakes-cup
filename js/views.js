/**
 * UI rendering functions for ski race results
 */

const Views = {
    /**
     * Format milliseconds to time string
     * @param {number} ms - Time in milliseconds
     * @returns {string} Formatted time (e.g., "1:23.45")
     */
    formatTime(ms) {
        if (ms === null || ms === undefined) return '-';

        const totalSeconds = ms / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = (totalSeconds % 60).toFixed(2);

        if (minutes > 0) {
            return `${minutes}:${seconds.padStart(5, '0')}`;
        }
        return seconds;
    },

    /**
     * Format date string
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    },

    /**
     * Render event list (homepage) with athlete search
     * Events may contain multiple race files (e.g., boys and girls on same date)
     */
    renderEventList(events, container, searchResults = null) {
        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h2>No Races Found</h2>
                    <p>Add XML race files to the data/races folder to get started.</p>
                </div>
            `;
            return;
        }

        const searchSection = searchResults ? this.renderAthleteSearchResults(searchResults) : '';

        const html = `
            <div class="event-list">
                <div class="search-section">
                    <h3>Find an Athlete</h3>
                    <input type="text" id="athlete-search" placeholder="Search by name..." class="search-input">
                </div>

                <div id="search-results">${searchSection}</div>

                <h2>Race Events</h2>
                <div class="event-cards">
                    ${events.map((event, index) => {
                        // Count total racers across all race files in event
                        const totalRacers = event.races.reduce((sum, r) => sum + r.racers.length, 0);
                        const disciplines = [...new Set(event.races.map(r => r.header.discipline).filter(d => d))];

                        return `
                            <div class="event-card" data-event-index="${index}">
                                <div class="event-date">${this.formatDate(event.date)}</div>
                                <div class="event-name">${event.name || 'Unnamed Event'}</div>
                                <div class="event-location">${event.location || ''}</div>
                                <div class="event-meta">
                                    <span>${totalRacers} racers</span>
                                    ${disciplines.length > 0 ? `<span>${disciplines.join(', ')}</span>` : ''}
                                    ${event.races.length > 1 ? `<span>${event.races.length} race files</span>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * Render athlete search results
     */
    renderAthleteSearchResults(results) {
        if (!results || results.length === 0) {
            return '<p class="no-results">No athletes found.</p>';
        }

        return `
            <div class="athlete-results">
                ${results.map(athlete => `
                    <div class="athlete-card">
                        <div class="athlete-header">
                            <h4>${athlete.firstName} ${athlete.lastName}</h4>
                            <span class="athlete-team">${athlete.team || 'No Team'}</span>
                            <span class="athlete-info">${athlete.gender === 'M' ? 'Boys' : 'Girls'} ${athlete.class || ''}</span>
                        </div>
                        <div class="athlete-stats">
                            <div class="stat">
                                <span class="stat-value">${athlete.totalPoints}</span>
                                <span class="stat-label">Total Points</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">#${athlete.seasonRank}</span>
                                <span class="stat-label">Season Rank</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">${athlete.eventResults.length}</span>
                                <span class="stat-label">Events</span>
                            </div>
                        </div>
                        <div class="athlete-events">
                            <table class="mini-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Event</th>
                                        <th>Place</th>
                                        <th>Points</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${athlete.eventResults.map(r => `
                                        <tr class="${r.dropped ? 'dropped-row' : ''}">
                                            <td>${this.formatDate(r.eventDate)}</td>
                                            <td>${r.eventName}</td>
                                            <td>${r.place || '-'}</td>
                                            <td>${r.points}${r.dropped ? ' (dropped)' : ''}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render individual race results
     * Always split by gender - Boys and Girls shown in tabs
     */
    renderRaceResults(race, container, filters = {}) {
        const gender = filters.gender || 'M'; // Default to Boys
        const raceClass = filters.class || null;
        const teamFilter = filters.team || null;

        // Individual results (scored against all of same gender)
        let results = Scoring.calculateIndividualResults(race.racers, gender, raceClass);

        // Get unique teams for the filter dropdown (from unfiltered results)
        const teams = [...new Set(results.map(r => r.team).filter(t => t))].sort();

        // Apply team filter if set
        if (teamFilter) {
            results = results.filter(r => r.team === teamFilter);
        }

        // Team standings (need class-specific scoring) - default to Varsity if no filter
        const effectiveClass = raceClass || 'Varsity';
        const teamStandings = Scoring.calculateTeamStandings(race.racers, gender, effectiveClass);

        const html = `
            <div class="race-results">
                <div class="race-header">
                    <button class="back-btn" data-action="back">&larr; All Races</button>
                    <h2>${race.header.name || 'Race Results'}</h2>
                    <div class="race-info">
                        <span>${this.formatDate(race.header.date)}</span>
                        ${race.header.location ? `<span>${race.header.location}</span>` : ''}
                        ${race.header.discipline ? `<span>${race.header.discipline}</span>` : ''}
                    </div>
                </div>

                <div class="gender-tabs">
                    <button class="gender-tab ${gender === 'M' ? 'active' : ''}" data-gender="M">Boys</button>
                    <button class="gender-tab ${gender === 'F' ? 'active' : ''}" data-gender="F">Girls</button>
                </div>

                <div class="filters">
                    <div class="filter-group">
                        <label>Class:</label>
                        <select id="class-filter">
                            <option value="">All Classes</option>
                            <option value="Varsity" ${raceClass === 'Varsity' ? 'selected' : ''}>Varsity</option>
                            <option value="JV" ${raceClass === 'JV' ? 'selected' : ''}>JV</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Team:</label>
                        <select id="team-filter">
                            <option value="">All Teams</option>
                            ${teams.map(team => `
                                <option value="${team}" ${teamFilter === team ? 'selected' : ''}>${team}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="results-layout">
                    <div class="results-main">
                        <h3>${gender === 'M' ? 'Boys' : 'Girls'}${raceClass ? ' ' + raceClass : ''}${teamFilter ? ' - ' + teamFilter : ''} Individual Results</h3>
                        ${this.renderResultsTable(results)}
                    </div>

                    <div class="results-sidebar">
                        <h3>${gender === 'M' ? 'Boys' : 'Girls'} ${effectiveClass} Team Standings</h3>
                        ${this.renderTeamStandings(teamStandings)}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * Format time behind leader
     */
    formatTimeBehind(ms) {
        if (ms === null || ms === undefined || ms === 0) return '-';
        const totalSeconds = ms / 1000;
        return `+${totalSeconds.toFixed(2)}`;
    },

    /**
     * Format run time with rank indicator
     */
    formatRunTime(ms, rank) {
        if (ms === null || ms === undefined) return '-';
        const timeStr = this.formatTime(ms);
        if (rank) {
            return `${timeStr}<sup class="run-rank">${rank}</sup>`;
        }
        return timeStr;
    },

    /**
     * Render results table with time behind instead of points
     */
    renderResultsTable(results) {
        if (results.length === 0) {
            return '<p class="no-results">No results match the current filters.</p>';
        }

        const fieldSize = results.length > 0 ? results[0].fieldSize : 0;

        // Find leader time (first finisher with a time)
        const leaderTime = results.find(r => r.totalTime !== null && !r.dnf && !r.dsq)?.totalTime || null;

        return `
            <p class="field-info">${fieldSize} ${results.length > 0 && results[0].gender === 'M' ? 'boys' : 'girls'} started (individual points: 1st = ${fieldSize} pts)</p>
            <div class="table-wrapper">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Place</th>
                            <th>Name</th>
                            <th>Team</th>
                            <th>Class</th>
                            <th>Run 1</th>
                            <th>Run 2</th>
                            <th>Total</th>
                            <th>Behind</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => {
                            const timeBehind = (r.totalTime !== null && leaderTime !== null && !r.dnf && !r.dsq)
                                ? r.totalTime - leaderTime
                                : null;
                            return `
                            <tr class="${r.dnf || r.dsq ? 'dnf' : ''}">
                                <td>${r.place || '-'}</td>
                                <td>${r.firstName} ${r.lastName}</td>
                                <td>${r.team || '-'}</td>
                                <td>${r.class || '-'}</td>
                                <td class="run-time">${this.formatRunTime(r.run1, r.run1Rank)}</td>
                                <td class="run-time">${this.formatRunTime(r.run2, r.run2Rank)}</td>
                                <td class="total-time">${r.dnf || r.dsq ? r.status : this.formatTime(r.totalTime)}</td>
                                <td class="time-behind">${this.formatTimeBehind(timeBehind)}</td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    /**
     * Render team standings with all athletes shown
     */
    renderTeamStandings(standings) {
        if (standings.length === 0) {
            return '<p class="no-results">No team results available. Select a class (Varsity/JV) to see team standings.</p>';
        }

        return `
            <div class="team-standings">
                ${standings.map(team => `
                    <div class="team-card">
                        <div class="team-place">${team.place}</div>
                        <div class="team-info">
                            <div class="team-name">${team.name}</div>
                            <div class="team-points">${team.totalPoints} pts</div>
                            <div class="team-all-racers">
                                ${team.racers.map(r =>
                                    `<span class="team-racer ${r.isScoring ? 'scoring' : 'non-scoring'}">${r.firstName} ${r.lastName} (${r.teamPoints || 0})${r.isScoring ? ' ✓' : ''}</span>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render season standings page
     * Always split by gender - Boys and Girls shown in tabs
     * @param {Array} events - Array of event objects (grouped races)
     */
    renderSeasonStandings(events, container, filters = {}) {
        const gender = filters.gender || 'M'; // Default to Boys
        const raceClass = filters.class || null;
        const page = filters.page || 1;
        const pageSize = filters.pageSize || 100;

        const standings = Scoring.calculateSeasonStandings(events, gender, raceClass);

        // Store standings data for pagination
        this._currentIndividuals = standings.individuals;

        const html = `
            <div class="season-standings">
                <h2>Season Standings</h2>
                <p class="standings-meta">${standings.eventCount} event${standings.eventCount !== 1 ? 's' : ''} (best ${standings.countedEvents} counted, 1 dropped)</p>

                <div class="gender-tabs">
                    <button class="gender-tab ${gender === 'M' ? 'active' : ''}" data-gender="M">Boys</button>
                    <button class="gender-tab ${gender === 'F' ? 'active' : ''}" data-gender="F">Girls</button>
                </div>

                <div class="filters">
                    <div class="filter-group">
                        <label>Class:</label>
                        <select id="class-filter">
                            <option value="">All Classes</option>
                            <option value="Varsity" ${raceClass === 'Varsity' ? 'selected' : ''}>Varsity</option>
                            <option value="JV" ${raceClass === 'JV' ? 'selected' : ''}>JV</option>
                        </select>
                    </div>
                </div>

                <div class="standings-tabs">
                    <button class="tab-btn active" data-tab="teams">Team Standings</button>
                    <button class="tab-btn" data-tab="individuals">Individual Standings</button>
                </div>

                <div class="tab-content" id="teams-tab">
                    ${this.renderSeasonTeamStandings(standings.teams)}
                </div>

                <div class="tab-content hidden" id="individuals-tab">
                    ${this.renderSeasonIndividualStandings(standings.individuals, page, pageSize)}
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * Render season team standings
     */
    renderSeasonTeamStandings(teams) {
        if (teams.length === 0) {
            return '<p class="no-results">No team results available.</p>';
        }

        return `
            <div class="table-wrapper">
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>Place</th>
                            <th>Team</th>
                            <th>Total Points</th>
                            <th>Events</th>
                            <th>Event Breakdown</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teams.map(team => `
                            <tr>
                                <td>${team.place}</td>
                                <td>${team.name}</td>
                                <td class="points">${team.totalPoints}</td>
                                <td>${team.eventCount}</td>
                                <td class="breakdown">
                                    ${team.countedResults.map(r =>
                                        `<span class="race-points" title="${r.eventName}">${r.points}</span>`
                                    ).join(' + ')}
                                    ${team.droppedResult ?
                                        `<span class="race-points dropped" title="${team.droppedResult.eventName} (dropped)">${team.droppedResult.points}</span>`
                                        : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    /**
     * Render season individual standings with pagination
     */
    renderSeasonIndividualStandings(individuals, page = 1, pageSize = 100) {
        if (individuals.length === 0) {
            return '<p class="no-results">No individual results available.</p>';
        }

        const totalPages = Math.ceil(individuals.length / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, individuals.length);
        const pageIndividuals = individuals.slice(startIndex, endIndex);

        return `
            <div class="pagination-controls">
                <div class="page-size-selector">
                    <label>Show:</label>
                    <select id="page-size-select">
                        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                        <option value="200" ${pageSize === 200 ? 'selected' : ''}>200</option>
                        <option value="all" ${pageSize >= individuals.length ? 'selected' : ''}>All</option>
                    </select>
                </div>
                <div class="page-info">
                    Showing ${startIndex + 1}-${endIndex} of ${individuals.length}
                </div>
                <div class="page-buttons">
                    <button class="page-btn" data-page="1" ${page === 1 ? 'disabled' : ''}>&laquo; First</button>
                    <button class="page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                    <span class="page-number">Page ${page} of ${totalPages}</span>
                    <button class="page-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                    <button class="page-btn" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}>Last &raquo;</button>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>Place</th>
                            <th>Name</th>
                            <th>Team</th>
                            <th>Total Points</th>
                            <th>Events</th>
                            <th>Event Breakdown</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageIndividuals.map(ind => `
                            <tr>
                                <td>${ind.place}</td>
                                <td>${ind.firstName} ${ind.lastName}</td>
                                <td>${ind.team || '-'}</td>
                                <td class="points">${ind.totalPoints}</td>
                                <td>${ind.eventCount}</td>
                                <td class="breakdown">
                                    ${ind.countedResults.map(r =>
                                        `<span class="race-points" title="${r.eventName}: Place ${r.place || '-'}">${r.points}</span>`
                                    ).join(' + ')}
                                    ${ind.droppedResult ?
                                        `<span class="race-points dropped" title="${ind.droppedResult.eventName} (dropped)">${ind.droppedResult.points}</span>`
                                        : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${totalPages > 1 ? `
            <div class="pagination-controls pagination-bottom">
                <div class="page-buttons">
                    <button class="page-btn" data-page="1" ${page === 1 ? 'disabled' : ''}>&laquo; First</button>
                    <button class="page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
                    <span class="page-number">Page ${page} of ${totalPages}</span>
                    <button class="page-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>Next &rsaquo;</button>
                    <button class="page-btn" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}>Last &raquo;</button>
                </div>
            </div>
            ` : ''}
        `;
    },

    /**
     * Render loading state
     */
    renderLoading(container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading race data...</p>
            </div>
        `;
    },

    /**
     * Render error state
     */
    renderError(container, message) {
        container.innerHTML = `
            <div class="error">
                <h2>Error</h2>
                <p>${message}</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Views;
}
