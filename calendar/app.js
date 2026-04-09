        // Event storage
        let events = [];
        const storageKey = 'calendarEvents';

        // Check for localStorage support
        const hasLocalStorage = (function() {
            try {
                localStorage.setItem('test', 'test');
                localStorage.removeItem('test');
                return true;
            } catch(e) {
                return false;
            }
        })();

        function loadEvents() {
            if (hasLocalStorage) {
                const storedEvents = localStorage.getItem(storageKey);
                if (storedEvents) {
                    events = JSON.parse(storedEvents);
                }
            }
        }

        function saveEvents() {
            if (hasLocalStorage) {
                localStorage.setItem(storageKey, JSON.stringify(events));
            }
        }

        function populateYearDropdown() {
            const select = document.getElementById('yearSelect');
            for (let year = 1900; year <= 2100; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                select.appendChild(option);
            }
            select.value = new Date().getFullYear();
        }

        function generateCalendar(year) {
            const months = [
                'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
            ];
            // Account for leap years
            const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
            const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

            // Update title
            const titleText = `${year} Calendar`;
            document.title = titleText; // Set document title
            document.getElementById('calendarTitle').textContent = titleText;
            document.getElementById('printEventsTitle').textContent = `${year} Events List`;

            // Get current date to highlight current day
            const today = new Date();
            const currentDay = today.getDate();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();

            // Calculate first day of each month
            const firstDayOfMonth = [];
            let currentDate = new Date(year, 0, 1);
            for (let i = 0; i < 12; i++) {
                firstDayOfMonth.push(currentDate.getDay());
                currentDate.setMonth(currentDate.getMonth() + 1);
            }

            // Generate month headers
            const headerRow = document.getElementById('monthHeaders');
            headerRow.innerHTML = `<th>${year}</th>`;
            months.forEach(month => {
                headerRow.innerHTML += `<th>${month}</th>`;
            });

            // Generate calendar body
            const tbody = document.getElementById('calendarBody');
            tbody.innerHTML = ''; // Clear previous content
            let dayCounter = Array(12).fill(0);

            for (let day = 1; day <= 31; day++) {
                let row = `<tr><td>${day}</td>`;

                for (let month = 0; month < 12; month++) {
                    let cellContent = '';
                    let classes = [];
                    let eventMarkersHtml = '';

                    if (day <= daysInMonth[month]) {
                        const date = new Date(year, month, day);
                        const dayOfWeek = date.getDay();
                        dayCounter[month]++;
                        cellContent = date.toLocaleString('en-US', { weekday: 'short' });
                        cellContent = cellContent.substring(0,cellContent.length - 1);

                        // Add weekend class if applicable
                        if (dayOfWeek === 0 || dayOfWeek === 6) {
                            classes.push('weekend');
                        }else{
                            classes.push('weekday');
                        }

                        // Add current-day class if this cell is today
                        if (year === currentYear && month === currentMonth && day === currentDay) {
                            classes.push('current-day');
                        }

                        // Check for events on this day
                        const dateStr = formatDateString(date);
                        const eventsOnDay = getEventsForDate(dateStr);

                        if (eventsOnDay.length > 0) {
                            // Create event markers container
                            eventMarkersHtml = '<div class="event-markers">';

                            // Add up to 3 event markers (to avoid overcrowding)
                            const maxMarkers = Math.min(eventsOnDay.length, 3);
                            for (let i = 0; i < maxMarkers; i++) {
                                const eventColor = eventsOnDay[i].color || '#4285f4';
                                eventMarkersHtml += `<div class="event-marker" style="background-color: ${eventColor};"
                                    title="${eventsOnDay[i].title}"></div>`;
                            }

                            // If there are more events than we're showing markers for
                            if (eventsOnDay.length > maxMarkers) {
                                eventMarkersHtml += `<div class="event-marker" style="background-color: #999;"
                                    title="${eventsOnDay.length - maxMarkers} more event(s)"></div>`;
                            }

                            eventMarkersHtml += '</div>';

                            // Add data attribute for date to enable click handling
                            cellContent = `<span data-date="${dateStr}">${cellContent}</span>`;
                        }
                    }

                    row += `<td class="${classes.join(' ')}">${cellContent}${eventMarkersHtml}</td>`;
                }
                row += '</tr>';
                tbody.innerHTML += row;
            }

            // Add event listeners to cells with events
            document.querySelectorAll('[data-date]').forEach(element => {
                element.style.cursor = 'pointer';
                element.addEventListener('click', function() {
                    const dateStr = this.getAttribute('data-date');
                    showEventsForDate(dateStr);
                });
            });

            // Update the print events list
            updatePrintEventsList();
        }

        // Calculate number of days between two dates
        function getDaysBetween(startDate, endDate) {
            if (!startDate || !endDate) return 1;

            const start = new Date(startDate);
            const end = new Date(endDate);

            // Reset time part to ensure we're counting full days
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);

            // Calculate difference in milliseconds and convert to days
            const diffTime = Math.abs(end - start);
            return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
        }

        function formatDateString(date) {
            return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }

        function getEventsForDate(dateStr) {
            return events.filter(event => {
                // Check if date is between start and end dates (inclusive)
                const eventDate = new Date(dateStr);
                const startDate = new Date(event.startDate);
                startDate.setHours(0, 0, 0, 0);

                if (event.endDate) {
                    const endDate = new Date(event.endDate);
                    endDate.setHours(23, 59, 59, 999);
                    return eventDate >= startDate && eventDate <= endDate;
                } else {
                    // If no end date, check if it matches start date
                    return dateStr === event.startDate;
                }
            });
        }

        function showEventsForDate(dateStr) {
            const eventsOnDay = getEventsForDate(dateStr);
            if (eventsOnDay.length > 0) {
                // Highlight these events in the events list
                renderEventsList();

                // Scroll to the first event
                const firstEventEl = document.querySelector(`[data-event-id="${eventsOnDay[0].id}"]`);
                if (firstEventEl) {
                    firstEventEl.scrollIntoView({ behavior: 'smooth' });
                    firstEventEl.style.boxShadow = '0 0 8px rgba(66, 133, 244, 0.8)';
                    setTimeout(() => {
                        firstEventEl.style.boxShadow = 'none';
                    }, 2000);
                }
            }
        }

        function renderEventsList() {
            const eventsList = document.getElementById('eventsList');
            eventsList.innerHTML = '';

            // Sort events by start date
            const sortedEvents = [...events].sort((a, b) => {
                return new Date(a.startDate) - new Date(b.startDate);
            });

            if (sortedEvents.length === 0) {
                eventsList.innerHTML = '<p>No events added yet.</p>';
                return;
            }

            sortedEvents.forEach(event => {
                const eventEl = document.createElement('div');
                eventEl.className = 'event-item';
                eventEl.dataset.eventId = event.id;
                eventEl.style.backgroundColor = `${event.color}20`; // Use color with transparency
                eventEl.style.borderLeft = `4px solid ${event.color}`;

                let dateDisplay = formatDisplayDate(event.startDate);
                if (event.endDate) {
                    dateDisplay += ` to ${formatDisplayDate(event.endDate)}`;
                }

                // Calculate event duration
                let durationHtml = '';
                if (event.endDate) {
                    const days = getDaysBetween(event.startDate, event.endDate);
                    if (days > 1) {
                        durationHtml = `<span class="event-duration">(${days} days)</span>`;
                    }
                }

                eventEl.innerHTML = `
                    <div class="event-title">${event.title} ${durationHtml}</div>
                    <div class="event-date">${dateDisplay}</div>
                    ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
                    <button class="delete-btn" data-event-id="${event.id}">&times;</button>
                `;

                // Add click event for editing
                eventEl.addEventListener('click', function(e) {
                    if (!e.target.matches('.delete-btn')) {
                        openEditEventDialog(event.id);
                    }
                });

                eventsList.appendChild(eventEl);
            });

            // Add delete button event listeners
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const eventId = this.getAttribute('data-event-id');
                    deleteEvent(eventId);
                });
            });

            // Update the print events list as well
            updatePrintEventsList();
        }

        function updatePrintEventsList() {
            const printEventsList = document.getElementById('printEventsList');
            const printEventsLegend = document.getElementById('printEventsLegend');

            printEventsList.innerHTML = '';
            printEventsLegend.innerHTML = '';

            // Sort events by start date
            const sortedEvents = [...events].sort((a, b) => {
                return new Date(a.startDate) - new Date(b.startDate);
            });

            if (sortedEvents.length === 0) {
                printEventsList.innerHTML = '<p>No events scheduled.</p>';
                return;
            }

            // Create a map to track unique colors for the legend
            const colorMap = new Map();

            sortedEvents.forEach(event => {
                const eventEl = document.createElement('div');
                eventEl.className = 'print-event-item';
                eventEl.style.borderLeftColor = event.color;
                eventEl.style.backgroundColor = `${event.color}10`; // Very light background

                let dateDisplay = formatDisplayDate(event.startDate);
                if (event.endDate) {
                    dateDisplay += ` to ${formatDisplayDate(event.endDate)}`;
                }

                // Calculate event duration for print view
                let durationHtml = '';
                if (event.endDate) {
                    const days = getDaysBetween(event.startDate, event.endDate);
                    if (days > 1) {
                        durationHtml = `<span class="event-duration">(${days} days)</span>`;
                    }
                }

                eventEl.innerHTML = `
                    <div class="event-title">${event.title} ${durationHtml}</div>
                    <div class="event-date">${dateDisplay}</div>
                    ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
                `;

                printEventsList.appendChild(eventEl);

                // Add to color map for legend (if not already there)
                if (!colorMap.has(event.color)) {
                    colorMap.set(event.color, event.title);
                }
            });

            // Create the color legend
            colorMap.forEach((title, color) => {
                const legendItem = document.createElement('div');
                legendItem.className = 'legend-item';
                legendItem.innerHTML = `
                    <div class="legend-marker" style="background-color: ${color};"></div>
                    <div>${color}</div>
                `;
                printEventsLegend.appendChild(legendItem);
            });
        }

        function formatDisplayDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        function setupEventDialog() {
            const dialog = document.getElementById('eventDialog');
            const form = document.getElementById('eventForm');
            const addBtn = document.getElementById('addEventBtn');
            const cancelBtn = document.getElementById('cancelBtn');

            // Set default start date to today
            document.getElementById('eventStartDate').valueAsDate = new Date();

            // Open dialog when Add Event button is clicked
            addBtn.addEventListener('click', function() {
                // Clear form for new event
                form.reset();
                document.getElementById('eventId').value = '';
                document.getElementById('eventStartDate').valueAsDate = new Date();
                dialog.showModal();
            });

            // Close dialog when Cancel button is clicked
            cancelBtn.addEventListener('click', function() {
                dialog.close();
            });

            // Handle form submission
            form.addEventListener('submit', function(e) {
                e.preventDefault();

                const eventId = document.getElementById('eventId').value;
                const eventData = {
                    title: document.getElementById('eventTitle').value,
                    startDate: document.getElementById('eventStartDate').value,
                    endDate: document.getElementById('eventEndDate').value || null,
                    color: document.getElementById('eventColor').value,
                    notes: document.getElementById('eventNotes').value
                };

                if (eventId) {
                    // Update existing event
                    updateEvent(eventId, eventData);
                } else {
                    // Add new event
                    addEvent(eventData);
                }

                dialog.close();
            });
        }

        function openEditEventDialog(eventId) {
            const event = events.find(e => e.id === eventId);
            if (!event) return;

            document.getElementById('eventId').value = event.id;
            document.getElementById('eventTitle').value = event.title;
            document.getElementById('eventStartDate').value = event.startDate;
            document.getElementById('eventEndDate').value = event.endDate || '';
            document.getElementById('eventColor').value = event.color;
            document.getElementById('eventNotes').value = event.notes || '';

            document.getElementById('eventDialog').showModal();
        }

        function addEvent(eventData) {
            const newEvent = {
                id: 'event_' + Date.now(),
                title: eventData.title,
                startDate: eventData.startDate,
                endDate: eventData.endDate,
                color: eventData.color,
                notes: eventData.notes
            };

            events.push(newEvent);
            saveEvents();
            renderEventsList();
            generateCalendar(parseInt(document.getElementById('yearSelect').value));
        }

        function updateEvent(eventId, eventData) {
            const index = events.findIndex(e => e.id === eventId);
            if (index !== -1) {
                events[index] = {
                    ...events[index],
                    title: eventData.title,
                    startDate: eventData.startDate,
                    endDate: eventData.endDate,
                    color: eventData.color,
                    notes: eventData.notes
                };

                saveEvents();
                renderEventsList();
                generateCalendar(parseInt(document.getElementById('yearSelect').value));
            }
        }

        function deleteEvent(eventId) {
            if (confirm('Are you sure you want to delete this event?')) {
                events = events.filter(e => e.id !== eventId);
                saveEvents();
                renderEventsList();
                generateCalendar(parseInt(document.getElementById('yearSelect').value));
            }
        }

        // Initialize page
        window.onload = function() {
            loadEvents();
            populateYearDropdown();
            const currentYear = new Date().getFullYear();
            generateCalendar(currentYear); // Default year

            // Add event listener for year selection
            document.getElementById('yearSelect').addEventListener('change', function(e) {
                generateCalendar(parseInt(e.target.value));
            });

            setupEventDialog();
            renderEventsList();
        }
