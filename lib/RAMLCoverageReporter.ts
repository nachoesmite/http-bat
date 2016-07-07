/**
 * Initialize a new LCOV reporter.
 * File format of LCOV can be found here: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
 * The reporter is built after this parser: https://raw.github.com/SonarCommunity/sonar-javascript/master/sonar-javascript-plugin/src/main/java/org/sonar/plugins/javascript/coverage/LCOVParser.java
 *
 * @param {Runner} runner
 * @api public
 */

export function generateString(filename: string, data: { source: number[]; }): string {
  let sout = [];

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