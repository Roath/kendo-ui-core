(function(f, define){
    define([ "./kendo.scheduler.view" ], f);
})(function(){

var __meta__ = {
    id: "scheduler.timelineview",
    name: "Scheduler Timeline View",
    category: "web",
    description: "The Scheduler Timeline View",
    depends: [ "scheduler.view" ],
    hidden: true
};

(function($, undefined) {
    var kendo = window.kendo,
        ui = kendo.ui,
        setTime = kendo.date.setTime,
        SchedulerView = ui.SchedulerView,
        extend = $.extend,
        proxy = $.proxy,
        getDate = kendo.date.getDate,
        getMilliseconds = kendo.date.getMilliseconds,
        MS_PER_DAY = kendo.date.MS_PER_DAY,
        NS = ".kendoTimelineView";

    var EVENT_TEMPLATE = kendo.template('<div>' +
                '<div class="k-event-template">${title}</div></div>'),
        DATA_HEADER_TEMPLATE = kendo.template("<span class='k-link k-nav-day'>#=kendo.toString(date, 'ddd M/dd')#</span>"),
        EVENT_WRAPPER_STRING = '<div role="gridcell" aria-selected="false" ' +
                'data-#=ns#uid="#=uid#"' +
                '#if (resources[0]) { #' +
                    'style="background-color:#=resources[0].color#; border-color: #=resources[0].color#"' +
                    'class="k-event#=inverseColor ? " k-event-inverse" : ""#" ' +
                '#} else {#' +
                    'class="k-event"' +
                '#}#' +
                '>' +
                '<span class="k-event-actions">' +
                    '# if(data.tail) {#' +
                        '<span class="k-icon k-i-arrow-w"></span>' +
                    '#}#' +
                    '# if(data.isException()) {#' +
                        '<span class="k-icon k-i-exception"></span>' +
                    '# } else if(data.isRecurring()) {#' +
                        '<span class="k-icon k-i-refresh"></span>' +
                    '# } #' +
                '</span>' +
                '{0}' +
                '<span class="k-event-actions">' +
                    '#if (showDelete) {#' +
                        '<a href="\\#" class="k-link k-event-delete"><span class="k-icon k-si-close"></span></a>' +
                    '#}#' +
                    '# if(data.head) {#' +
                        '<span class="k-icon k-i-arrow-e"></span>' +
                    '#}#' +
                '</span>' +
                '#if(resizable && !data.tail){#' +
                '<span class="k-resize-handle k-resize-w"></span>' +
                '#}#' +
                '#if(resizable && !data.head){#' +
                '<span class="k-resize-handle k-resize-e"></span>' +
                '#}#' +
                '</div>';

    function times(rowLevels, rowCount) {
        var rows = new Array(rowCount).join().split(",");
        var rowHeaderRows = [];
        var rowIndex;

        for (var rowLevelIndex = 0; rowLevelIndex < rowLevels.length; rowLevelIndex++) {
            var level = rowLevels[rowLevelIndex];
            var rowspan = rowCount / level.length;
            var className;

            for (rowIndex = 0; rowIndex < level.length; rowIndex++) {
                className = level[rowIndex].className || "";

                if (level[rowIndex].allDay) {
                    className = "k-scheduler-times-all-day";
                }

                rows[rowspan * rowIndex] += '<th class="' + className + '" rowspan="' + rowspan + '">' + level[rowIndex].text + "</th>";
            }
        }

        for (rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            rowHeaderRows.push(rows[rowIndex]);
        }

        if (rowCount < 1) {
            return $();
        }

        return $('<div class="k-scheduler-times">' + table(rowHeaderRows) + '</div>');
    }

    function toInvariantTime(date) {
        var staticDate = new Date(1980, 1, 1, 0, 0, 0);
        setTime(staticDate, getMilliseconds(date));
        return staticDate;
    }

    function isInDateRange(value, min, max) {
        return value >= min && value <= max;
    }

    function isInTimeRange(value, min, max, overlaps) {
        overlaps = overlaps ? value <= max : value < max;
        return value > min && overlaps;
    }

    var TimelineView = SchedulerView.extend({
        init: function(element, options) {
            var that = this;
            //only vertical grouping is supported = ignore orientation?

            SchedulerView.fn.init.call(that, element, options);

            that.title = that.options.title || that.options.name;

            that._templates();

            that._editable();

            that.calculateDateRange();

            that._groups();
        },
        name: "timeline",

        _editable: function() {
            if (this.options.editable) {
                if (this._isMobile()) {
                    this._touchEditable();
                } else {
                    this._mouseEditable();
                }
            }
        },

        _mouseEditable: function() {
            var that = this;
            that.element.on("click" + NS, ".k-event a:has(.k-si-close)", function(e) {
                that.trigger("remove", { uid: $(this).closest(".k-event").attr(kendo.attr("uid")) });
                e.preventDefault();
            });

            if (that.options.editable.create !== false) {
                that.element.on("dblclick" + NS, ".k-scheduler-content td", function(e) {
                    var slot = that._slotByPosition(e.pageX, e.pageY);

                    if (slot) {
                        var resourceInfo = that._resourceBySlot(slot);
                        that.trigger("add", { eventInfo: extend({ start: slot.startDate(), end: slot.endDate() }, resourceInfo) });
                    }

                    e.preventDefault();
                });
            }

            if (that.options.editable.update !== false) {
                that.element.on("dblclick" + NS, ".k-event", function(e) {
                    that.trigger("edit", { uid: $(this).closest(".k-event").attr(kendo.attr("uid")) });
                    e.preventDefault();
                });
            }
        },

        _touchEditable: function() {
            var that = this;

            if (that.options.editable.create !== false) {
                that._addUserEvents = new kendo.UserEvents(that.element, {
                    filter:  ".k-scheduler-content td",
                    tap: function(e) {
                        var slot = that._slotByPosition(e.x.location, e.y.location);

                        if (slot) {
                            var resourceInfo = that._resourceBySlot(slot);
                            that.trigger("add", { eventInfo: extend({ start: slot.startDate(), end: slot.endDate() }, resourceInfo) });
                        }

                        e.preventDefault();
                    }
                });
            }

            if (that.options.editable.update !== false) {
                that._editUserEvents = new kendo.UserEvents(that.element, {
                    filter: ".k-event",
                    tap: function(e) {
                        var eventElement = $(e.target).closest(".k-event");

                        if (!eventElement.hasClass("k-event-active")) {
                            that.trigger("edit", { uid: eventElement.attr(kendo.attr("uid")) });
                        }

                        e.preventDefault();
                    }
                });
            }
        },

       _slotByPosition: function(x, y) {
           var slot;

           var offset;

           if (this._isVerticallyGrouped()) {
               offset = this.content.offset();
               y += this.content[0].scrollTop;
               x += this.content[0].scrollLeft;
           } else {
               offset = this.element.find(".k-scheduler-header-wrap:has(.k-scheduler-header-all-day)").find(">div").offset();
           }

           if (offset) {
               x -= offset.left;
               y -= offset.top;
           }

           x = Math.ceil(x);
           y = Math.ceil(y);

           var group;
           var groupIndex;

           for (groupIndex = 0; groupIndex < this.groups.length; groupIndex++) {
                group = this.groups[groupIndex];

                slot = group.daySlotByPosition(x, y);

                if (slot) {
                    return slot;
                }
           }

           if (offset) {
               x += offset.left;
               y += offset.top;
           }

           offset = this.content.offset();

           x -= offset.left;
           y -= offset.top;

           if (!this._isVerticallyGrouped()) {
               y += this.content[0].scrollTop;
               x += this.content[0].scrollLeft;
           }

           x = Math.ceil(x);
           y = Math.ceil(y);

           for (groupIndex = 0; groupIndex < this.groups.length; groupIndex++) {
                group = this.groups[groupIndex];

                slot = group.timeSlotByPosition(x, y);

                if (slot) {
                    return slot;
                }
           }

           return null;
       },

       _getColumnCount: function() {
            var options = this.options;
            var msMajorInterval = this._timeSlotInterval();
            var msMin = getMilliseconds(toInvariantTime(options.startTime));
            var msMax = getMilliseconds(toInvariantTime(options.endTime));
            var columnCount;

            columnCount = MS_PER_DAY / msMajorInterval;
            if (msMin != msMax) {
                if (msMin > msMax) {
                    msMax += MS_PER_DAY;
                }

                columnCount = (msMax - msMin) / msMajorInterval;
            }

            this._columnCount = Math.round(columnCount)
       },

        options: {
            name: "TimelineView",
            selectedDateFormat: "{0:D}",
            title: "",
            date: kendo.date.today(),
            startTime: kendo.date.today(),
            endTime: kendo.date.today(),
            minorTickCount: 2,
            editable: true,
            //new option
            numberOfDays: 1,
            majorTick: 60,
            majorTimeHeaderTemplate: "#=kendo.toString(date, 't')#",
            minorTimeHeaderTemplate: "&nbsp;",
            slotTemplate: "&nbsp;",
            eventTemplate: EVENT_TEMPLATE,
            dateHeaderTemplate: DATA_HEADER_TEMPLATE
        },

        events: ["remove", "add", "edit"],

        _templates: function() {
            var options = this.options,
                settings = extend({}, kendo.Template, options.templateSettings);

            this.eventTemplate = this._eventTmpl(options.eventTemplate, EVENT_WRAPPER_STRING);
            this.majorTimeHeaderTemplate = kendo.template(options.majorTimeHeaderTemplate, settings);
            this.minorTimeHeaderTemplate = kendo.template(options.minorTimeHeaderTemplate, settings);
            this.dateHeaderTemplate = kendo.template(options.dateHeaderTemplate, settings);
            this.slotTemplate = kendo.template(options.slotTemplate, settings);
        },

        _render: function(dates) {
            var that = this;

            dates = dates || [];

            //dates are considered as resource for creating columns
            //in current case they are not
            that._dates = dates;

            that._getColumnCount();

            that._startDate = dates[0];

            that._endDate = dates[(dates.length - 1) || 0];

            that._calculateSlotRanges();

            that.createLayout(that._layout(dates));

            that._content(that._columnCount * that._dates.length);

            that.refreshLayout();
        },

        _calculateSlotRanges: function () {
            var dates = this._dates;
            var slotStartTime = this.startTime();
            var slotEndTime = this.endTime();

            if (getMilliseconds(slotEndTime) === getMilliseconds(kendo.date.getDate(slotEndTime))) {
                slotEndTime = kendo.date.getDate(slotEndTime);
                setTime(slotEndTime, MS_PER_DAY - 1);
            }

            slotEndTime = getMilliseconds(slotEndTime);
            slotStartTime = getMilliseconds(slotStartTime);

            var slotRanges = [];
            for (var i = 0; i < dates.length; i++) {
                var rangeStart = getDate(dates[i]);
                setTime(rangeStart, slotStartTime);

                var rangeEnd = getDate(dates[i]);
                setTime(rangeEnd, slotEndTime);

                slotRanges.push({
                    start: kendo.date.toUtcTime(rangeStart),
                    end: kendo.date.toUtcTime(rangeEnd)
                });
            }

            this._slotRanges = slotRanges;
        },

        _layout: function(dates) {
            var columns = [];
            var rows = [];
            var that = this;
            var options = that.options;
            var columnCount = that._columnCount;
            var columnTimeFormat;
            var msMajorInterval = that._timeSlotInterval();

            if (msMajorInterval >= MS_PER_DAY) {
                columnTimeFormat = "{0:M}";
            } else {
                //use :
                //columnTimeFormat = "{0:t}";
                columnTimeFormat = "{0:HH:mm}";
            }
            
            for (var idx = 0; idx < dates.length; idx++) {
                for (var columnIndex = 0; columnIndex < columnCount; columnIndex++) { 
                    var column = {};
                    var columnOffset = (+options.startTime) + (msMajorInterval * columnIndex);
                    
                     column.text = kendo.format(columnTimeFormat, new Date(columnOffset));
                     columns.push(column);
                }
            }

            var resources = this.groupedResources;

            if (resources.length && this._isGrouped()) {
                //horizontal grouping is not supported
                //is correct to always render vertical grouping?
                rows = this._createRowsLayout(resources, null);
            } else {
                rows = [{
                    //add template here
                    text: "All events"
                }];
            }

            return {
                columns: columns,
                rows: rows
            };
        },

        _content: function(columnCount) {
            var that = this;
            var options = that.options;
            var isVerticalGroupped = false;

            var groupsCount = 1;
            var rowCount;

            rowCount = this._groupCount();

            var html = '';

            html += '<tbody>';

            var appendRow = function() {
                var content = "";
                var idx;
                var length;
                var groupIdx = 0;

                content = '<tr>';

                for (; groupIdx < groupsCount; groupIdx++) {
                    for (idx = 0, length = columnCount; idx < length; idx++) {

                        content += '<td>';
                        content += "</td>";
                    }
                }

                content += "</tr>";

                return content;
            };

            for (var rowIdx = 0; rowIdx < rowCount; rowIdx++) {
                html += appendRow();
            }

            html += '</tbody>';

            this.content.find("table").append(html);
        },

        _groups: function() {
            var groupCount = this._groupCount();
            var columnCount = this._columnCount * this._dates.length;

            this.groups = [];

            for (var idx = 0; idx < groupCount; idx++) {
                var view = this._addResourceView(idx);
                var dates = this._dates;
                var start = dates[0];
                var end = dates[(dates.length - 1) || 0];
                view.addTimeSlotCollection(start, kendo.date.addDays(end, 1));
            }

            this._timeSlotGroups(groupCount, columnCount);
        },

        _isGrouped: function () {
            return !!this.groupedResources.length;
        },

        _timeSlotGroups: function (groupCount, columnCount) {
            //example logic
            var interval = this._timeSlotInterval();
            var isGrouped = this._isGrouped();
            var tableRows = this.content.find("tr");
            var rowCount = tableRows.length;

            tableRows.attr("role", "row");

            if (isGrouped) {
                rowCount = Math.floor(rowCount / groupCount);
            }

            for (var groupIndex = 0; groupIndex < groupCount; groupIndex++) {
                var rowMultiplier = 0;
                var cells = tableRows[groupIndex].children;
                var group = this.groups[groupIndex];
                var datesCount = this._dates.length;
                var time;

                if (isGrouped) {
                    rowMultiplier = groupIndex;
                }

                var rowIndex = rowMultiplier * rowCount;

                var cellMultiplier = 0;

                if (!isGrouped) {
                    cellMultiplier = groupIndex;
                }

                //two possible slot creation approaches:
                //1) current - loop throught the dates - this way the current date is available directly by index
                //2) another - loop throught all cells for given row and get date from deviding index by column index
                for (var dateIndex = 0; dateIndex < datesCount; dateIndex++) {
                    var dayColumnCount = Math.floor(columnCount / datesCount);
                    time = getMilliseconds(new Date(+this.options.startTime));
                    for (var cellIndex = cellMultiplier * columnCount; cellIndex < columnCount / datesCount ; cellIndex++) {
                        var cell = cells[cellIndex + (dateIndex * dayColumnCount)];
                        var collection = group.getTimeSlotCollection(0);
                        var currentDate = this._dates[dateIndex];
                        var currentTime = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                        var start = currentTime + time;
                        var end = start + interval;

                        cell.setAttribute("role", "gridcell");
                        cell.setAttribute("aria-selected", false);

                        collection.addTimeSlot(cell, start, end);

                        time += interval;
                    }
                }
            }
        },

        startDate: function() {
            return this._startDate;
        },

        endDate: function() {
            return this._endDate;
        },

        startTime: function() {
            var options = this.options;
            return options.startTime;
        },

        endTime: function() {
            var options = this.options;
            return options.endTime;
        },

        _timeSlotInterval: function() {
            var options = this.options;
            return msMajorInterval = options.majorTick * kendo.date.MS_PER_MINUTE;
        },

        nextDate: function () {
            return kendo.date.nextDay(this.endDate());
        },
        previousDate: function () {
            var daysToSubstract = -Math.abs(this.options.numberOfDays); //get the negative value of numberOfDays
            var startDate = kendo.date.addDays(this.startDate(), daysToSubstract); //substract the dates
            return startDate;
        },

        calculateDateRange: function() {
            //add support for different intervals - day, week, month
            var numberOfDays = Math.abs(this.options.numberOfDays);
            var start = this.options.date;
            var idx;
            var length;
            var dates = [];

            for (idx = 0, length = numberOfDays; idx < length; idx++) {
                dates.push(start);
                start = kendo.date.nextDay(start);
            }
            this._render(dates);
            //this._render([this.options.date, kendo.date.addDays(this.options.date, 1)]);
        },

        render: function(events) {
            this._headerColumnCount = 0;

            this._groups();

            this.element.find(".k-event").remove();

            events = new kendo.data.Query(events)
                .sort([{ field: "start", dir: "asc" },{ field: "end", dir: "desc" }])
                .toArray();

            var eventsByResource = [];

            this._eventsByResource(events, this.groupedResources, eventsByResource);

            var that = this;
     
            var eventsPerDate = $.map(this._dates, function(date) {
                return Math.max.apply(null,
                    $.map(eventsByResource, function(events) {
                        return $.grep(events, function(event) {
                            return isInDateRange(date, getDate(event.start), getDate(event.end));
                        }).length;
                    })
                );
            });

            var height = Math.max.apply(null, eventsPerDate);

            //this._updateAllDayHeaderHeight((height + 1) * this._allDayHeaderHeight);

            for (var groupIndex = 0; groupIndex < eventsByResource.length; groupIndex++) {
                this._renderEvents(eventsByResource[groupIndex], groupIndex);
            }
            
            this.trigger("activate");
        
              //To be implemented
            //throw "render is not implemented";
        },

        _eventsByResource: function(events, resources, result) {
            //todo
            var resource = resources[0];

            if (resource) {
                var view = resource.dataSource.view();

                for (var itemIdx = 0; itemIdx < view.length; itemIdx++) {
                    var value = this._resourceValue(resource, view[itemIdx]);

                    var eventsFilteredByResource = new kendo.data.Query(events).filter({ field: resource.field, operator: SchedulerView.groupEqFilter(value) }).toArray();

                    if (resources.length > 1) {
                        this._eventsByResource(eventsFilteredByResource, resources.slice(1), result);
                    } else {
                        result.push(eventsFilteredByResource);
                    }
                }
            } else {
                result.push(events);
            }
        },

        _isInDateSlot: function(event) {
            var startTime = event.start;
            var endTime = event.end;
            var rangeStart = getDate(this._startDate);
            var rangeEnd = kendo.date.addDays(getDate(this._endDate),1);

            if (startTime <= rangeEnd && rangeStart <= endTime) {
                return true;
            }
            return false;
        },

        _isInTimeSlot: function(event) {
            var startTime = event.startTime || kendo.date.toUtcTime(event.start);
            var endTime = event.endTime || kendo.date.toUtcTime(event.end);

            var slotRanges = this._slotRanges;

            if (startTime === endTime) {
                endTime = endTime+1;
            }

            for (var slotIndex = 0; slotIndex < slotRanges.length; slotIndex++) {
                if (startTime <= slotRanges[slotIndex].end && slotRanges[slotIndex].start < endTime) {
                    return true;
                }
            }
            return false;
        },

        _renderEvents: function(events, groupIndex) {
            var event;
            var idx;
            var length;
       
            for (idx = 0, length = events.length; idx < length; idx++) {
                event = events[idx];

                if (this._isInDateSlot(event)) {
                    var isMultiDayEvent = event.isAllDay || event.end.getTime() - event.start.getTime() >= MS_PER_DAY;
                    var container = this.content;

                    if (isMultiDayEvent || this._isInTimeSlot(event)) {
                        var start = event.start;
                        var end = event.end;
                        var startTime = getMilliseconds(this.startTime());
                        var endTime = getMilliseconds(this.endTime());
                        var eventStartTime = event._time("start");
                        var eventEndTime = event._time("end");
                        var tail = false;
                        var head = false;
                        var eventStartDate;
                        var eventEndDate;
                        var occurrence;

                        if (event.isAllDay) {
                            eventStartDate = getDate(start);
                            if (startTime > eventStartTime) {
                                setTime(eventStartDate, startTime);
                                tail = true;
                            }

                            eventEndDate = getDate(end);
                            if (endTime === getMilliseconds(getDate(this.endTime()))) {
                                eventEndDate = kendo.date.addDays(eventEndDate, 1);
                            } else {
                                setTime(eventEndDate, endTime);
                                head = true;
                            }
                        } else {
                            if (startTime > eventStartTime) {
                                eventStartDate = getDate(start);
                                setTime(eventStartDate, startTime);
                                tail = true;
                            } else if ((endTime === 0 ? MS_PER_DAY : endTime ) < eventStartTime) {
                                eventStartDate = getDate(start);
                                eventStartDate = kendo.date.addDays(eventStartDate,1);
                                setTime(eventStartDate, startTime);
                                tail = true;
                            }

                            if ((endTime === 0 ? MS_PER_DAY : endTime ) < eventEndTime) {
                                eventEndDate = getDate(end);
                                setTime(eventEndDate, endTime);
                                head = true;
                            } else if ((endTime === 0 ? MS_PER_DAY : endTime ) < startTime) {
                                eventEndDate = getDate(end);
                                eventEndDate = kendo.date.addDays(eventEndDate,-1);
                                setTime(eventEndDate, endTime);
                                head = true;
                            }
                        }

                        occurrence = event.clone({
                            start: eventStartDate ? eventStartDate : start,
                            end: eventEndDate ? eventEndDate : end,
                            startTime: eventStartDate ? kendo.date.toUtcTime(eventStartDate) : event.startTime,
                            endTime:  eventEndDate ? kendo.date.toUtcTime(eventEndDate) : event.endTime,
                            isAllDay: false
                        });

                        if (this._isInTimeSlot(occurrence)) {
                            var group = this.groups[groupIndex];
                            var ranges = group.slotRanges(occurrence, false);
                            var rangeCount = ranges.length;

                            if (rangeCount > 0) {
                                var element;
                                var range = ranges[0];

                                element = this._createEventElement(occurrence, event, true, range.head || head, range.tail || tail);
                                element.appendTo(container);
                                this._positionEvent(occurrence, element, range);
                            }
                        }
                    }
                }
            }
        },

        _createEventElement: function(occurrence, event, isOneDayEvent, head, tail) {
            var template = this.eventTemplate;
            var editable = this.options.editable;
            var isMobile = this._isMobile();
            var showDelete = editable && editable.destroy !== false && !isMobile;
            var resizable = editable && editable.resize !== false;
            var eventStartTime = event._time("start");
            var eventEndTime = event._time("end");
            var eventStartDate = event.start;
            var eventEndDate = event.end;

            var resources = this.eventResources(event);
            
            if (event.startTime) {
                eventStartDate = new Date(eventStartTime);
                eventStartDate = kendo.timezone.apply(eventStartDate, "Etc/UTC");
            }

            if (event.endTime) {
                eventEndDate = new Date(eventEndTime);
                eventEndDate = kendo.timezone.apply(eventEndDate, "Etc/UTC");
            }

            var data = extend({}, {
                ns: kendo.ns,
                resizable: resizable,
                showDelete: showDelete,
                head: head,
                tail: tail,
                singleDay: this._dates.length == 1,
                resources: resources,
                inverseColor: resources && resources[0] ? this._shouldInverseResourceColor(resources[0]) : false
            }, event, {
                start: eventStartDate,
                end: eventEndDate
            });

            var element = $(template(data));

            this.angular("compile", function(){
                return {
                    elements: element,
                    data: [ { dataItem: data } ]
                };
            });

            return element;
        },

        _positionEvent: function(event, element, slotRange) {
            //todo
            //var slotWidth = slotRange.innerWidth();
            var slotWidth = slotRange.start.clientWidth;
            var startIndex = slotRange.start.index;
            var endIndex = slotRange.end.index;

            var allDayEvents = SchedulerView.collidingEvents(slotRange.events(), startIndex, endIndex);

            var currentColumnCount = this._headerColumnCount || 0;

            var leftOffset = 2;

            var rightOffset = startIndex !== endIndex ? 5 : 4;

            var start = event.startTime || event.start;
            var end = event.endTime || event.end;

            var rect = slotRange.outerRect(start, end, false);
            rect.top = slotRange.start.offsetTop;

            var height = rect.bottom - rect.top - 2; /* two times border width */
            var width = rect.right - rect.left -2;
            //console.log(width);

            if (width < 0) {
                width = 0;
            }

            if (height < 0) {
                height = 0;
            }

            //console.log(kendo.format("width: {0}, height: {1}", width, height));
            var eventHeight = height;

            element
                .css({
                    left: rect.left,
                    width: width,
                    height: "20px"
                });

            slotRange.addEvent({ slotIndex: startIndex, start: startIndex, end: endIndex, element: element });

            //allday events only ?
            allDayEvents.push({ slotIndex: startIndex, start: startIndex, end: endIndex, element: element });

            var rows = SchedulerView.createRows(allDayEvents);

            if (rows.length && rows.length > currentColumnCount) {
                this._headerColumnCount = rows.length;
            }

            var top = slotRange.start.offsetTop;
            //console.log("row length " + rows.length);
            for (var idx = 0, length = rows.length; idx < length; idx++) {
                var rowEvents = rows[idx].events;
                var date = new Date();

                for (var j = 0, eventLength = rowEvents.length; j < eventLength; j++) {
                    $(rowEvents[j].element).css({
                        //need update
                        top: top + idx * eventHeight
                    });
                }
            }

            //var start = event.startTime || event.start;
            //var end = event.endTime || event.end;
            //
            //var rect = slotRange.innerRect(start, end, false);
            //rect.top = slotRange.start.offsetTop;
            //
            //var height = rect.bottom - rect.top - 2; /* two times border width */
            //var width = rect.right - rect.left -2;
            //
            //if (width < 0) {
            //    width = 0;
            //}
            //
            //if (height < 0) {
            //    height = 0;
            //}
            //
            ////need update
            //element.css( {
            //    top:rect.top,
            //    height: height,
            //    width: width,
            //    left: rect.left,
            //    "min-height": 10 //update?
            //} );
            //
            ////JUST ADDED - > need update as it should align the events by rows not by columns
            //this._arrangeColumns(element, rect.top, element[0].clientHeight, slotRange);
        },

        _groupCount: function() {
            var resources = this.groupedResources;

            if (resources.length) {
                isVerticalGroupped = this._groupOrientation() === "vertical";
                if (isVerticalGroupped) {
                    return this._rowCountForLevel(this.rowLevels.length - 1);
                }
            }
            return 1;
        },

        _rowCountForLevel: function(level) {
            var rowLevel = this.rowLevels[level];
            return rowLevel ? rowLevel.length : 0;
        },

        _updateResizeHint: function(event, groupIndex, startTime, endTime) {
            var multiday = false;

            var group = this.groups[groupIndex];

            var ranges = group.ranges(startTime, endTime, false, false);

            this._removeResizeHint();

            for (var rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
                var range = ranges[rangeIndex];
                var start = range.startSlot();

                var startRect = range.innerRect(startTime, endTime, false);
                startRect.top = start.offsetTop;

                var width = startRect.right - startRect.left;
                var height = start.offsetHeight;

                var hint = SchedulerView.fn._createResizeHint.call(this,
                    startRect.left,
                    startRect.top,
                    width,
                    height
                );

                this._resizeHint = this._resizeHint.add(hint);
            }

            var format = "t";
            var container = this.content;

            this._resizeHint.appendTo(container);

            this._resizeHint.find(".k-label-top,.k-label-bottom").text("");

            this._resizeHint.first().addClass("k-first").find(".k-label-top").text(kendo.toString(kendo.timezone.toLocalDate(startTime), format));

            this._resizeHint.last().addClass("k-last").find(".k-label-bottom").text(kendo.toString(kendo.timezone.toLocalDate(endTime), format));
        },

        destroy: function() {
            var that = this;

            if (that.element) {
                that.element.off(NS);
            }

            SchedulerView.fn.destroy.call(this);
        }
    });
    
    extend(true, ui, {
        TimelineView: TimelineView
    });

})(window.kendo.jQuery);

return window.kendo;

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
