/*
 * Produces zigzag line string consisting of count times a horizontal displacement of length followed
 * by a vertical displacement of length.
 *
 */
var fs = require('fs')
var moment = require('moment')
var program = require('commander')
const debug = require('./lib/debug')
const zigzag = require('./lib/zigzag-lib.js')

debug.init(true, [""])

program
    .version('1.1.0')
    .description('generates a LineString Feature of zigzag movements')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "zigzag.json")
    .requiredOption('-l, --length <length>', 'Length of segment')
    .requiredOption('-c, --count <count>', 'Count of zigzags')
    .parse(process.argv)

debug.print(program.opts())

const count = parseInt(program.count)
const length = parseInt(program.length) // km

fs.writeFileSync(program.O, JSON.stringify(zigzag.zigzag([4.3483286,50.8445793],length,count,program)), { mode: 0o644 })
debug.print(program.O + ' written')
