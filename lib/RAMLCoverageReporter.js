/**
 * Initialize a new LCOV reporter.
 * File format of LCOV can be found here: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
 * The reporter is built after this parser: https://raw.github.com/SonarCommunity/sonar-javascript/master/sonar-javascript-plugin/src/main/java/org/sonar/plugins/javascript/coverage/LCOVParser.java
 *
 * @param {Runner} runner
 * @api public
 */
"use strict";
function generateString(filename, data) {
    var sout = [];
    sout.push('SF:' + filename + '\n');
    data.source.forEach(function (line, num) {
        // increase the line number, as JS arrays are zero-based
        num++;
        if (typeof data.source[num] !== "undefined") {
            sout.push('DA:' + num + ',' + data.source[num] + '\n');
        }
    });
    sout.push('end_of_record');
    return sout.join('');
}
exports.generateString = generateString;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUkFNTENvdmVyYWdlUmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJSQU1MQ292ZXJhZ2VSZXBvcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7OztHQU9HOztBQUVILHdCQUErQixRQUFnQixFQUFFLElBQTJCO0lBQzFFLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUVkLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUVuQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQUksRUFBRSxHQUFHO1FBQ3JDLHdEQUF3RDtRQUN4RCxHQUFHLEVBQUUsQ0FBQztRQUVOLEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUN6RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBRTNCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZCLENBQUM7QUFqQmUsc0JBQWMsaUJBaUI3QixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IExDT1YgcmVwb3J0ZXIuXG4gKiBGaWxlIGZvcm1hdCBvZiBMQ09WIGNhbiBiZSBmb3VuZCBoZXJlOiBodHRwOi8vbHRwLnNvdXJjZWZvcmdlLm5ldC9jb3ZlcmFnZS9sY292L2dlbmluZm8uMS5waHBcbiAqIFRoZSByZXBvcnRlciBpcyBidWlsdCBhZnRlciB0aGlzIHBhcnNlcjogaHR0cHM6Ly9yYXcuZ2l0aHViLmNvbS9Tb25hckNvbW11bml0eS9zb25hci1qYXZhc2NyaXB0L21hc3Rlci9zb25hci1qYXZhc2NyaXB0LXBsdWdpbi9zcmMvbWFpbi9qYXZhL29yZy9zb25hci9wbHVnaW5zL2phdmFzY3JpcHQvY292ZXJhZ2UvTENPVlBhcnNlci5qYXZhXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVTdHJpbmcoZmlsZW5hbWU6IHN0cmluZywgZGF0YTogeyBzb3VyY2U6IG51bWJlcltdOyB9KTogc3RyaW5nIHtcbiAgbGV0IHNvdXQgPSBbXTtcblxuICBzb3V0LnB1c2goJ1NGOicgKyBmaWxlbmFtZSArICdcXG4nKTtcblxuICBkYXRhLnNvdXJjZS5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lLCBudW0pIHtcbiAgICAvLyBpbmNyZWFzZSB0aGUgbGluZSBudW1iZXIsIGFzIEpTIGFycmF5cyBhcmUgemVyby1iYXNlZFxuICAgIG51bSsrO1xuXG4gICAgaWYgKHR5cGVvZiBkYXRhLnNvdXJjZVtudW1dICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICBzb3V0LnB1c2goJ0RBOicgKyBudW0gKyAnLCcgKyBkYXRhLnNvdXJjZVtudW1dICsgJ1xcbicpO1xuICAgIH1cbiAgfSk7XG5cbiAgc291dC5wdXNoKCdlbmRfb2ZfcmVjb3JkJyk7XG5cbiAgcmV0dXJuIHNvdXQuam9pbignJyk7XG59Il19