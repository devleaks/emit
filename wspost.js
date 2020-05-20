const fs = require('fs')
var program = require('commander')

const debug = require('./lib/debug')
const sender = require('./lib/ws-post-lib.js')

/* COMMAND LINE PARAMETERS
 */
program
    .version('1.3.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-p, --payload', 'csv has payload column')
    .option('-r, --rate <delay>', 'Let that amount of time between events, 1 second, default', 1)
    .option('-s, --speed <factor>', 'Increases time by that factor')
    .option('-w, --wait <time>', 'Wait delay seconds before starting to emit', 5)
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, ["", "_post"])
debug.print(program.opts())


/* INPUT
 */
const file = fs.readFileSync(program.file, 'utf8')
const records = file.split('\n');
debug.print("record 0", records[0])

/* MAIN
 */
var res = sender.post(records, program.opts())