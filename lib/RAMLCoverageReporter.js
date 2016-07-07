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
            sout.push('DA:' + (num + 1) + ',' + data.source[num] + '\n');
        }
    });
    sout.push('end_of_record');
    return sout.join('');
}
exports.generateString = generateString;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUkFNTENvdmVyYWdlUmVwb3J0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJSQU1MQ292ZXJhZ2VSZXBvcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7OztHQU9HOztBQUVILHdCQUErQixRQUFnQixFQUFFLElBQTJCO0lBQzFFLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUVkLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUVuQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQUksRUFBRSxHQUFHO1FBQ3JDLHdEQUF3RDtRQUN4RCxHQUFHLEVBQUUsQ0FBQztRQUVOLEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFFM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDdkIsQ0FBQztBQWpCZSxzQkFBYyxpQkFpQjdCLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEluaXRpYWxpemUgYSBuZXcgTENPViByZXBvcnRlci5cbiAqIEZpbGUgZm9ybWF0IG9mIExDT1YgY2FuIGJlIGZvdW5kIGhlcmU6IGh0dHA6Ly9sdHAuc291cmNlZm9yZ2UubmV0L2NvdmVyYWdlL2xjb3YvZ2VuaW5mby4xLnBocFxuICogVGhlIHJlcG9ydGVyIGlzIGJ1aWx0IGFmdGVyIHRoaXMgcGFyc2VyOiBodHRwczovL3Jhdy5naXRodWIuY29tL1NvbmFyQ29tbXVuaXR5L3NvbmFyLWphdmFzY3JpcHQvbWFzdGVyL3NvbmFyLWphdmFzY3JpcHQtcGx1Z2luL3NyYy9tYWluL2phdmEvb3JnL3NvbmFyL3BsdWdpbnMvamF2YXNjcmlwdC9jb3ZlcmFnZS9MQ09WUGFyc2VyLmphdmFcbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVN0cmluZyhmaWxlbmFtZTogc3RyaW5nLCBkYXRhOiB7IHNvdXJjZTogbnVtYmVyW107IH0pOiBzdHJpbmcge1xuICBsZXQgc291dCA9IFtdO1xuXG4gIHNvdXQucHVzaCgnU0Y6JyArIGZpbGVuYW1lICsgJ1xcbicpO1xuXG4gIGRhdGEuc291cmNlLmZvckVhY2goZnVuY3Rpb24gKGxpbmUsIG51bSkge1xuICAgIC8vIGluY3JlYXNlIHRoZSBsaW5lIG51bWJlciwgYXMgSlMgYXJyYXlzIGFyZSB6ZXJvLWJhc2VkXG4gICAgbnVtKys7XG5cbiAgICBpZiAodHlwZW9mIGRhdGEuc291cmNlW251bV0gIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHNvdXQucHVzaCgnREE6JyArIChudW0gKyAxKSArICcsJyArIGRhdGEuc291cmNlW251bV0gKyAnXFxuJyk7XG4gICAgfVxuICB9KTtcblxuICBzb3V0LnB1c2goJ2VuZF9vZl9yZWNvcmQnKTtcblxuICByZXR1cm4gc291dC5qb2luKCcnKTtcbn0iXX0=