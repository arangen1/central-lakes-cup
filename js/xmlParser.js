/**
 * XML Parser for Split Second timing software race files
 * Handles the ClubRace XML format (both single-course and dual-course races)
 */

const XMLParser = {
    /**
     * Parse a race XML file and return structured data
     * @param {string} xmlText - Raw XML content
     * @returns {Object} Parsed race data
     */
    parseRace(xmlText) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'text/xml');

        // Check for parsing errors
        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            throw new Error('Failed to parse XML: ' + parseError.textContent);
        }

        const header = this.parseHeader(xml);
        const racers = this.parseCompetitors(xml, header.raceType);

        return {
            header,
            racers
        };
    },

    /**
     * Parse race header information
     */
    parseHeader(xml) {
        const header = xml.querySelector('Header');

        // Handle ClubRace format
        const name = this.getElementText(header, 'Header1') ||
                     this.getElementText(header, 'Name') ||
                     'Unnamed Race';

        // Parse date from DateI (days since epoch) or Date string
        let date = '';
        const dateI = this.getElementText(header, 'DateI');
        if (dateI) {
            // DateI is Excel serial date (days since Dec 30, 1899)
            // Use UTC to avoid timezone issues
            const days = parseInt(dateI);
            const ms = (days - 25569) * 86400 * 1000; // 25569 = days from 1899-12-30 to 1970-01-01
            const raceDate = new Date(ms);
            const year = raceDate.getUTCFullYear();
            const month = String(raceDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(raceDate.getUTCDate()).padStart(2, '0');
            date = `${year}-${month}-${day}`;
        } else {
            date = this.getElementText(header, 'Date');
        }

        const location = this.getElementText(header, 'RTResort') ||
                        this.getElementText(header, 'Location') ||
                        '';

        // Get race type: 0 = single course (2 runs same course), 1 = dual course (1 run each course)
        const raceType = parseInt(this.getElementText(header, 'RaceType')) || 0;

        // Determine discipline from USCSA race type or other fields
        let discipline = this.getElementText(header, 'USCSARaceType') ||
                        this.getElementText(header, 'Discipline') || '';

        return {
            name,
            date,
            location,
            discipline,
            raceType,
            courses: [
                { name: this.getElementText(header, 'Course1Name') || 'Run 1' },
                { name: this.getElementText(header, 'Course2Name') || 'Run 2' }
            ]
        };
    },

    /**
     * Derive gender from race name (Boys/Girls in title)
     */
    deriveGenderFromName(xml) {
        const header = xml.querySelector('Header');
        const name = this.getElementText(header, 'Header1') || '';
        const nameLower = name.toLowerCase();
        if (nameLower.includes('boys')) return 'M';
        if (nameLower.includes('girls')) return 'F';
        return null;
    },

    /**
     * Parse competitor entries with embedded times
     * @param {Document} xml - Parsed XML document
     * @param {number} raceType - 0 for single course, 1 for dual course
     */
    parseCompetitors(xml, raceType) {
        const racers = [];
        const compElements = xml.querySelectorAll('Comp');

        // Try to derive gender from race name as fallback
        const raceGender = this.deriveGenderFromName(xml);

        compElements.forEach(comp => {
            const rawClass = this.getElementText(comp, 'Class');
            let gender = this.getElementText(comp, 'Gender');

            // If no gender field, derive from class (VM, VF, JVM, JVF)
            if (!gender && rawClass) {
                const upperClass = rawClass.toUpperCase();
                if (upperClass === 'VM' || upperClass === 'JVM') {
                    gender = 'M';
                } else if (upperClass === 'VF' || upperClass === 'JVF') {
                    gender = 'F';
                }
            }

            // If still no gender, use race name gender
            if (!gender && raceGender) {
                gender = raceGender;
            }

            const racer = {
                bib: this.getElementText(comp, 'Bib'),
                firstName: this.getElementText(comp, 'FirstName').trim(),
                lastName: this.getElementText(comp, 'LastName').trim(),
                class: rawClass,
                team: this.getElementText(comp, 'Team'),
                gender: gender,
                times: []
            };

            // Parse embedded Time elements
            const timeElements = comp.querySelectorAll('Time');
            let runIndex = 0;

            timeElements.forEach(time => {
                const course = this.getElementText(time, 'Course');
                const result = this.getElementText(time, 'Result');
                const status = this.getElementText(time, 'Status');

                racer.times.push({
                    course: course,
                    runIndex: runIndex, // Track order of Time elements
                    time: result,
                    status: status
                });
                runIndex++;
            });

            // Process times to get run1, run2, total
            const processedTimes = this.processRacerTimes(racer.times, raceType);
            racer.run1 = processedTimes.run1;
            racer.run2 = processedTimes.run2;
            racer.totalTime = processedTimes.totalTime;
            racer.status = processedTimes.status;
            racer.dnf = processedTimes.dnf;
            racer.dsq = processedTimes.dsq;

            racers.push(racer);
        });

        return racers;
    },

    /**
     * Process racer times to get run1, run2, and total
     * @param {Array} times - Array of time entries
     * @param {number} raceType - 0 for single course, 1 for dual course
     */
    processRacerTimes(times, raceType) {
        let run1 = null;
        let run2 = null;
        let dnf = false;
        let dsq = false;
        let status = 'OK';

        if (raceType === 1) {
            // Dual course: Course 0 = Run 1, Course 1 = Run 2
            times.forEach(t => {
                const courseNum = parseInt(t.course);
                const timeVal = this.parseTime(t.time);
                const timeStatus = this.checkStatus(t.time, t.status);

                if (timeStatus === 'DNF') {
                    dnf = true;
                    status = 'DNF';
                } else if (timeStatus === 'DSQ') {
                    dsq = true;
                    status = 'DSQ';
                }

                if (courseNum === 0) {
                    run1 = timeVal;
                } else if (courseNum === 1) {
                    run2 = timeVal;
                }
            });
        } else {
            // Single course: First Time = Run 1, Second Time = Run 2 (by order)
            times.forEach(t => {
                const timeVal = this.parseTime(t.time);
                const timeStatus = this.checkStatus(t.time, t.status);

                if (timeStatus === 'DNF') {
                    dnf = true;
                    status = 'DNF';
                } else if (timeStatus === 'DSQ') {
                    dsq = true;
                    status = 'DSQ';
                }

                if (t.runIndex === 0) {
                    run1 = timeVal;
                } else if (t.runIndex === 1) {
                    run2 = timeVal;
                }
            });
        }

        // Calculate total time
        let totalTime = null;
        if (!dnf && !dsq && run1 !== null) {
            if (run2 !== null) {
                totalTime = run1 + run2;
            } else {
                totalTime = run1;
            }
        }

        return { run1, run2, totalTime, status, dnf, dsq };
    },

    /**
     * Check the status of a time entry
     */
    checkStatus(timeStr, statusCode) {
        // Check time string for status indicators
        if (timeStr === 'DNF' || timeStr === 'DNS') {
            return 'DNF';
        }
        if (timeStr === 'DSQ' || timeStr === 'DQ') {
            return 'DSQ';
        }

        // Check status code: 1 = OK, 2 = DNF, 3 = DSQ (typical Split Second codes)
        if (statusCode === '2') {
            return 'DNF';
        }
        if (statusCode === '3') {
            return 'DSQ';
        }

        return 'OK';
    },

    /**
     * Parse time string to milliseconds
     * Handles formats: "1:23.45", "83.45", "32.06"
     */
    parseTime(timeStr) {
        if (!timeStr || timeStr === '' || timeStr === 'DNF' || timeStr === 'DNS' || timeStr === 'DSQ' || timeStr === 'DQ') {
            return null;
        }

        // Remove any whitespace
        timeStr = timeStr.trim();

        const parts = timeStr.split(':');
        let totalMs = 0;

        if (parts.length === 1) {
            // Just seconds: "32.06"
            totalMs = parseFloat(parts[0]) * 1000;
        } else if (parts.length === 2) {
            // Minutes:seconds: "1:23.45"
            totalMs = parseInt(parts[0]) * 60 * 1000 + parseFloat(parts[1]) * 1000;
        } else if (parts.length === 3) {
            // Hours:minutes:seconds: "1:23:45.67"
            totalMs = parseInt(parts[0]) * 3600 * 1000 +
                      parseInt(parts[1]) * 60 * 1000 +
                      parseFloat(parts[2]) * 1000;
        }

        return Math.round(totalMs);
    },

    /**
     * Get text content of a child element
     */
    getElementText(parent, tagName) {
        if (!parent) return '';
        const el = parent.querySelector(tagName);
        return el ? el.textContent.trim() : '';
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XMLParser;
}
