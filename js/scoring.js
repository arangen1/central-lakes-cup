/**
 * Scoring calculations for alpine ski races
 * Based on Minnesota high school league rules
 *
 * Individual points: based on ALL starters of same GENDER (class doesn't matter)
 * Team points: based on starters in same GENDER + CLASS
 *
 * Only these teams count for individual scoring:
 * St Cloud Breakaways, Lakes Area, Brainerd, Annandale, Detroit Lakes
 */

const Scoring = {
    // Teams that count for individual scoring
    SCORING_TEAMS: [
        'St Cloud Breakaways',
        'Lakes Area',
        'Brainerd',
        'Annandale',
        'Detroit Lakes'
    ],

    /**
     * Check if a team is a scoring team for individual points
     */
    isScoringTeam(team) {
        if (!team) return false;
        const normalizedTeam = team.toLowerCase().trim();
        return this.SCORING_TEAMS.some(t =>
            normalizedTeam.includes(t.toLowerCase()) ||
            t.toLowerCase().includes(normalizedTeam)
        );
    },
    /**
     * Calculate points for a given place based on field size
     * @param {number} place - Finishing position (1-based)
     * @param {number} fieldSize - Number of starters
     * @returns {number} Points earned
     */
    getPointsForPlace(place, fieldSize) {
        if (place <= 0 || place > fieldSize) return 0;
        return fieldSize - place + 1;
    },

    /**
     * Check if racer's class matches the filter
     * Handles: V, VM, VF, Varsity, JV, JVM, JVF
     */
    matchesClass(racerClass, filterClass) {
        if (!racerClass) return false;
        const normalized = racerClass.toUpperCase().trim();
        const filter = filterClass.toUpperCase().trim();

        if (filter === 'VARSITY') {
            return normalized === 'V' ||
                   normalized === 'VM' ||
                   normalized === 'VF' ||
                   normalized === 'VARSITY';
        } else if (filter === 'JV') {
            return normalized === 'JV' ||
                   normalized === 'JVM' ||
                   normalized === 'JVF';
        }
        return normalized === filter;
    },

    /**
     * Determine if a racer is Varsity or JV
     */
    getClassCategory(racerClass) {
        if (!racerClass) return null;
        const normalized = racerClass.toUpperCase().trim();
        if (normalized === 'V' || normalized === 'VM' || normalized === 'VF' || normalized === 'VARSITY') {
            return 'Varsity';
        }
        if (normalized === 'JV' || normalized === 'JVM' || normalized === 'JVF') {
            return 'JV';
        }
        return null;
    },

    /**
     * Calculate run rankings for all racers of a gender
     * Rankings are among ALL racers (not just scoring teams)
     */
    calculateRunRankings(racers, gender) {
        const genderRacers = racers.filter(r => r.gender === gender);

        // Calculate run 1 rankings
        const run1Racers = genderRacers.filter(r => r.run1 !== null).sort((a, b) => a.run1 - b.run1);
        let run1Rank = 1;
        run1Racers.forEach((racer, index) => {
            if (index > 0 && racer.run1 === run1Racers[index - 1].run1) {
                racer.run1Rank = run1Racers[index - 1].run1Rank;
            } else {
                racer.run1Rank = run1Rank;
            }
            run1Rank = index + 2;
        });

        // Calculate run 2 rankings
        const run2Racers = genderRacers.filter(r => r.run2 !== null).sort((a, b) => a.run2 - b.run2);
        let run2Rank = 1;
        run2Racers.forEach((racer, index) => {
            if (index > 0 && racer.run2 === run2Racers[index - 1].run2) {
                racer.run2Rank = run2Racers[index - 1].run2Rank;
            } else {
                racer.run2Rank = run2Rank;
            }
            run2Rank = index + 2;
        });

        return { run1Count: run1Racers.length, run2Count: run2Racers.length };
    },

    /**
     * Calculate individual results
     * Individual points are based on ALL starters of same gender from scoring teams
     */
    calculateIndividualResults(racers, gender, raceClass = null) {
        // Get all racers of this gender FROM SCORING TEAMS for field size calculation
        const scoringTeamRacers = racers.filter(r =>
            r.gender === gender && this.isScoringTeam(r.team)
        );
        const genderFieldSize = scoringTeamRacers.length;

        // Get all racers of this gender (for display, but only scoring team racers get points)
        const genderRacers = racers.filter(r => r.gender === gender);

        // Calculate run rankings for all racers of this gender
        const runCounts = this.calculateRunRankings(racers, gender);

        // Only scoring team racers participate in individual scoring
        const scoringFinishers = scoringTeamRacers.filter(r => r.totalTime !== null && !r.dnf && !r.dsq);
        const scoringNonFinishers = scoringTeamRacers.filter(r => r.totalTime === null || r.dnf || r.dsq);

        // Sort scoring team finishers by time
        scoringFinishers.sort((a, b) => a.totalTime - b.totalTime);

        // Assign individual places and points (only to scoring team racers)
        let currentPlace = 1;
        scoringFinishers.forEach((racer, index) => {
            if (index > 0 && racer.totalTime === scoringFinishers[index - 1].totalTime) {
                racer.place = scoringFinishers[index - 1].place;
                racer.points = scoringFinishers[index - 1].points;
            } else {
                racer.place = currentPlace;
                racer.points = this.getPointsForPlace(currentPlace, genderFieldSize);
            }
            racer.fieldSize = genderFieldSize;
            racer.run1Count = runCounts.run1Count;
            racer.run2Count = runCounts.run2Count;
            currentPlace = index + 2;
        });

        scoringNonFinishers.forEach(racer => {
            racer.place = null;
            racer.points = 0;
            racer.fieldSize = genderFieldSize;
            racer.run1Count = runCounts.run1Count;
            racer.run2Count = runCounts.run2Count;
        });

        // Non-scoring team racers get no points but can be displayed
        const nonScoringRacers = genderRacers.filter(r => !this.isScoringTeam(r.team));
        nonScoringRacers.forEach(racer => {
            racer.place = null;
            racer.points = 0;
            racer.fieldSize = genderFieldSize;
            racer.run1Count = runCounts.run1Count;
            racer.run2Count = runCounts.run2Count;
        });

        // Combine all racers for display (scoring team racers have points, others don't)
        let results = [...scoringFinishers, ...scoringNonFinishers, ...nonScoringRacers];

        // Sort by place (finishers first, then non-finishers)
        results.sort((a, b) => {
            if (a.place === null && b.place === null) return 0;
            if (a.place === null) return 1;
            if (b.place === null) return -1;
            return a.place - b.place;
        });

        // Filter by class if requested (for display only)
        if (raceClass) {
            results = results.filter(r => this.matchesClass(r.class, raceClass));
        }

        return results;
    },

    /**
     * Calculate team standings for a race
     * Team points are based on gender + class field size
     */
    calculateTeamStandings(racers, gender, raceClass, topN = 4) {
        // Filter by gender and class
        const filtered = racers.filter(r =>
            r.gender === gender && this.matchesClass(r.class, raceClass)
        );

        const classFieldSize = filtered.length;

        // Get finishers and assign team points
        const finishers = filtered.filter(r => r.totalTime !== null && !r.dnf && !r.dsq);
        finishers.sort((a, b) => a.totalTime - b.totalTime);

        let currentPlace = 1;
        finishers.forEach((racer, index) => {
            if (index > 0 && racer.totalTime === finishers[index - 1].totalTime) {
                racer.teamPlace = finishers[index - 1].teamPlace;
                racer.teamPoints = finishers[index - 1].teamPoints;
            } else {
                racer.teamPlace = currentPlace;
                racer.teamPoints = this.getPointsForPlace(currentPlace, classFieldSize);
            }
            racer.teamFieldSize = classFieldSize;
            currentPlace = index + 2;
        });

        // Get non-finishers for display
        const nonFinishers = filtered.filter(r => r.totalTime === null || r.dnf || r.dsq);
        nonFinishers.forEach(racer => {
            racer.teamPlace = null;
            racer.teamPoints = 0;
            racer.teamFieldSize = classFieldSize;
        });

        // Group by team (include all racers, not just finishers)
        const teams = {};
        [...finishers, ...nonFinishers].forEach(racer => {
            if (!racer.team) return;
            if (!teams[racer.team]) {
                teams[racer.team] = {
                    name: racer.team,
                    racers: [],
                    totalPoints: 0
                };
            }
            teams[racer.team].racers.push(racer);
        });

        // Calculate team scores (top N) and mark scoring racers
        Object.values(teams).forEach(team => {
            team.racers.sort((a, b) => (b.teamPoints || 0) - (a.teamPoints || 0));
            team.scoringRacers = team.racers.filter(r => r.teamPoints > 0).slice(0, topN);
            // Mark which racers are scoring
            team.scoringRacers.forEach(r => r.isScoring = true);
            team.totalPoints = team.scoringRacers.reduce((sum, r) => sum + r.teamPoints, 0);
        });

        // Sort and rank teams
        const standings = Object.values(teams).sort((a, b) => b.totalPoints - a.totalPoints);
        standings.forEach((team, index) => {
            team.place = index + 1;
        });

        return standings;
    },

    /**
     * Calculate season standings
     * Drops worst result for both teams and individuals
     */
    calculateSeasonStandings(events, gender, raceClass = null) {
        const teamTotals = {};
        const individualTotals = {};

        // Process each event
        events.forEach(event => {
            // Combine racers from all race files in this event
            const allRacers = [];
            event.races.forEach(race => {
                race.racers.forEach(racer => {
                    allRacers.push({...racer});
                });
            });

            // Calculate individual results for this event
            const individualResults = this.calculateIndividualResults(allRacers, gender, raceClass);

            // Accumulate individual points
            individualResults.forEach(racer => {
                if (racer.points === 0) return; // Skip non-scorers

                const key = `${racer.firstName.trim()}_${racer.lastName.trim()}_${racer.team}`;
                if (!individualTotals[key]) {
                    individualTotals[key] = {
                        firstName: racer.firstName.trim(),
                        lastName: racer.lastName.trim(),
                        team: racer.team,
                        gender: racer.gender,
                        class: racer.class,
                        eventResults: []
                    };
                }
                individualTotals[key].eventResults.push({
                    eventName: event.name,
                    eventDate: event.date,
                    points: racer.points,
                    place: racer.place,
                    fieldSize: racer.fieldSize
                });
            });

            // Calculate team standings for this event (need class filter)
            const effectiveClass = raceClass || 'Varsity'; // Default to Varsity if not specified
            const teamStandings = this.calculateTeamStandings(allRacers, gender, effectiveClass);

            // Accumulate team points
            teamStandings.forEach(team => {
                if (!teamTotals[team.name]) {
                    teamTotals[team.name] = {
                        name: team.name,
                        eventResults: []
                    };
                }
                teamTotals[team.name].eventResults.push({
                    eventName: event.name,
                    eventDate: event.date,
                    points: team.totalPoints,
                    place: team.place
                });
            });
        });

        // Calculate totals with drop
        const totalEvents = events.length;
        Object.values(teamTotals).forEach(team => {
            const sorted = [...team.eventResults].sort((a, b) => b.points - a.points);
            // Only drop worst result if team participated in ALL events
            const shouldDrop = sorted.length >= totalEvents && totalEvents > 1;
            const counted = shouldDrop ? sorted.slice(0, -1) : sorted;
            team.totalPoints = counted.reduce((sum, r) => sum + r.points, 0);
            team.countedResults = counted;
            team.droppedResult = shouldDrop ? sorted[sorted.length - 1] : null;
            team.eventCount = sorted.length;
            team.totalEventsInSeason = totalEvents;
        });

        Object.values(individualTotals).forEach(ind => {
            const sorted = [...ind.eventResults].sort((a, b) => b.points - a.points);
            // Only drop worst result if athlete participated in ALL events
            const shouldDrop = sorted.length >= totalEvents && totalEvents > 1;
            const counted = shouldDrop ? sorted.slice(0, -1) : sorted;
            ind.totalPoints = counted.reduce((sum, r) => sum + r.points, 0);
            ind.countedResults = counted;
            ind.droppedResult = shouldDrop ? sorted[sorted.length - 1] : null;
            ind.eventCount = sorted.length;
            ind.totalEventsInSeason = totalEvents;
        });

        // Sort and rank
        const teamStandings = Object.values(teamTotals).sort((a, b) => b.totalPoints - a.totalPoints);
        teamStandings.forEach((team, index) => team.place = index + 1);

        const individualStandings = Object.values(individualTotals).sort((a, b) => b.totalPoints - a.totalPoints);
        individualStandings.forEach((ind, index) => ind.place = index + 1);

        const eventCount = events.length;
        return {
            teams: teamStandings,
            individuals: individualStandings,
            eventCount: eventCount,
            countedEvents: eventCount > 1 ? eventCount - 1 : eventCount
        };
    },

    /**
     * Get all division combinations
     */
    getDivisions() {
        return [
            { gender: 'M', class: 'Varsity', label: 'Boys Varsity' },
            { gender: 'F', class: 'Varsity', label: 'Girls Varsity' },
            { gender: 'M', class: 'JV', label: 'Boys JV' },
            { gender: 'F', class: 'JV', label: 'Girls JV' }
        ];
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scoring;
}
