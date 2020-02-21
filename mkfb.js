const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug.js')

const config = require('./sim-config')

const airportData = require('./lib/airport.js')

var airport = airportData.init(config)

var airports = require('./airports.js')

program
    .version('1.0.0')
    .description('generates flightboard')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.csv")
    .requiredOption('-c, --count <count>', 'Count of zigzags')
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('-t, --type <type>', 'Type of flights {PAX|CARGO}', 'PAX')
    .parse(process.argv)

debug.init(program.debug, ["makeFlightboard"])
debug.print(program.opts())

function rndInt(n) {
    return Math.floor(Math.random() * n)
}

function nextFlight(n) {
    return 5 + n * rndInt(5)
}

function turnAround(type = false) {
    const base = type == 'CARGO' ? 90 : 75
    const extra = type == 'CARGO' ? 90 : 60
    const rndextra = 5 * rndInt(Math.round(extra/5))
    return base + rndextra
}

//

function makeFlightboard(cnt, startdate, type = false) {
    var txt = 'move,flight,airport,date,time,plane,parking,comment\n'
    var airline = type == 'CARGO' ? 'CA' : 'PX'
    var time = startdate ? moment(startdate) : moment()
    var flight = 100
    for(var i = 0; i < cnt; i++) {
        var parking = airportData.randomParking()
        var airport = airports.randomAirport()
        time.add(nextFlight(4), 'm')
        flight += (1 + rndInt(10))
        flightname = airline + flight.toString().padStart(3, '0')
        // arrival
        debug.print('arrival', flightname, airport, time.format('HH:mm'), parking)
        txt += 'arrival,'+flightname+','+airport+',,'+time.format('HH:mm')+',,'+parking+',\n'
        // turnaround
        var time2 = moment(time)
        time2.add(turnAround(), 'm')
        // departure
        airport = airports.randomAirport()
        flight += (1 + rndInt(10))
        flightname = airline + flight.toString().padStart(3, '0')
        debug.print('departure', flightname, airport, time2.format('HH:mm'), parking)
        txt += 'departure,'+flightname+','+airport+',,'+time2.format('HH:mm')+',,'+parking+',\n'
    }
    return txt
}

var s = makeFlightboard(program.count, program.startDate, program.type)
fs.writeFileSync(program.output, s, { mode: 0o644 })
debug.print(program.output + ' written')