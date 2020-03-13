const fs = require('fs')
const moment = require('moment')
var program = require('commander')

const debug = require('./lib/debug')
const airport = require('./lib/airport')
const kpost = require('./lib/kafka-post-lib.js')

/* COMMAND LINE PARAMETERS
 */
program
    .version('1.0.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-k, --kafka', 'send to kafka')
    .option('-p, --payload', 'csv has payload column')
    .option('-r, --rate <delay>', 'Let that amount of time between events, 1 second, default', 1)
    .option('-t, --time <factor>', 'Increases time by that factor')
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


/* CONFIG
 */
const scenario = fs.readFileSync(program.file, 'utf8')

/* CONFIG
 */
const records = airport.play(scenario)

/* MAIN
 */
if(records) {
    const res = kpost.post(records, program.opts())
}


/* OUTPUT: On interrupt...
 */
const i_should_exit = true
process.on('SIGINT', function() {
    console.log("Caught interrupt signal");

    if (records) {
        fs.writeFileSync(program.output, res, { mode: 0o644 })
        debug.print(program.output + ' written')
    } else {
        debug.print('nothing saved')
    }

    if (i_should_exit)
        process.exit();
});