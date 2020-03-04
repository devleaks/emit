const fs = require('fs')
var program = require('commander')
const parse = require('csv-parse/lib/sync')

const debug = require('./lib/debug')
const kpost = require('./lib/kafka-post-lib.js')

/* COMMAND LINE PARAMETERS
 */
program
    .version('1.2.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-k, --kafka', 'send to kafka')
    .option('-p, --payload', 'csv has payload column')
    .option('-r, --rate <delay>', 'Let that amount of time between events, 1 second, default', 1)
    .option('-s, --speed <factor>', 'Increases time by that factor')
    .option('-o, --output <file>', 'Save to file, default to out.csv', "out.csv")
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


/* INPUT
 */
const csvstring = fs.readFileSync(program.file, 'utf8')
const cols = "queue,name,timestamp,lat,lon,speed,heading" + (program.payload ? ",payload" : "")

var records = parse(csvstring, { columns: cols.split(",") })
debug.print(records[0])
records = records.sort((a, b) => (a.datetime > b.datetime) ? 1 : -1)


/* MAIN
 */
var res = kpost.post(records, program.opts())


return
/* OUTPUT
 */
if (res) {
    fs.writeFileSync(program.output, res, { mode: 0o644 })
    debug.print(program.output + ' written')
} else {
    debug.print('nothing saved')
}