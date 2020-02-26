const fs = require('fs')
var program = require('commander')
const moment = require('moment')

const debug = require('./lib/debug')
const tocsv = require('./lib/tocsv-lib.js')

/* COMMAND LINE PARAMETERS
 */
debug.init(true, [""])

program
    .version('1.2.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-n, --name <name>', 'device name')
    .option('-q, --queue <name>', 'Kafka queue name', "queue")
    .option('-1, --first', 'Add header line')
    .option('-p, --payload', 'Add payload column with all properties')
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('-e, --event <event>', 'Sync event number to sync date on', 0)
    .option('-r, --random <delay>', 'Add or substract random delay to start-date in minutes', 0)
    .option('-o, --output <file>', 'Save to file, default to out.csv', "out.csv")
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


/* INPUT
 */
const jsonstring = fs.readFileSync(program.file, 'utf8')

const startdate = moment(program.startDate)
if (!startdate.isValid()) {
    debug.print('start date is not valid', startdate)
    return false
}


/* MAIN
 */
var res = (program.event == '*') ?
            tocsv.tocsv_sync_all(JSON.parse(jsonstring), startdate, program)
            :
            tocsv.tocsv(JSON.parse(jsonstring), startdate, program)


/* OUTPUT
 */
if (res) {
    fs.writeFileSync(program.output, res, { mode: 0o644 })
    console.log(program.output + ' written')
} else {
    console.log('nothing saved')
}