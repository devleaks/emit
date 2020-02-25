const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug')

const config = require('./sim-config')

const airportData = require('./lib/airport.js')
const aircraftData = require('./lib/aircraft')

var airport = airportData.init(config)

var airports = require('./eblg/json/airports.js')

// round to next 5 minutes
const now = moment();
const now5 = moment(now).add(5 - (now.minute() % 5), "minutes").add(- now.second(), "seconds").add(- now.millisecond(), "milliseconds")

program
    .version('1.0.0')
    .description('generates flightboard')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.csv")
    .requiredOption('-c, --count <count>', 'Count of zigzags')
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', now5.toISOString())
    .option('-t, --type <type>', 'Type of flights {PAX|CARGO}')
    .parse(process.argv)

debug.init(program.debug, ["randomFlightboard"])
debug.print(program.opts())

function rndInt(n) {
    return Math.floor(Math.random() * n)
}

function nextFlight(n) {
    return 5 + 5 * rndInt(n)
}

function turnAround(type = false) {
    const base = type == 'CARGO' ? 90 : 75
    const extra = type == 'CARGO' ? 90 : 60
    const rndextra = 5 * rndInt(Math.round(extra / 5))
    return base + rndextra
}

// C... = CARGO, P... = PAX
function randomAirline(type) {
    const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var char = UPPERCASE.charAt(Math.floor(Math.random() * UPPERCASE.length))
    var airline
    switch (type) {
        case 'CARGO':
            airline = 'C' + char
            break
        case 'PAX':
            airline = 'P' + char
            break
        default:
            airline = (Math.random() > 0.5 ? 'C' : 'P') + char
    }
    return airline
}

var _flightnum = 100

function randomFlightname(type) {
    var airline = randomAirline(type)
    if (_flightnum > 980) _flightnum = 100 // loop
    _flightnum += (1 + rndInt(10))
    return airline + _flightnum.toString().padStart(3, '0')
}

function randomFlightboard(cnt, startdate, type = false) {
    var txt = 'move,flight,airport,date,time,plane,parking,comment\n'
    var airline = randomAirline(type)

    var time = startdate ? moment(startdate) : moment()
    var flight = 100
    for (var i = 0; i < cnt; i++) {
        var parking = airportData.randomParking()
        var aircraft = aircraftData.randomAircraftICAO()
        var airport = airports.randomAirport()
        var ltype = type ? type : (Math.random() > 0.5 ? 'PAX':'CARGO')
        time.add(nextFlight(2), 'm')
        flightname = randomFlightname(ltype)
        // arrival
        debug.print('arrival', flightname, airport, time.format('HH:mm'), aircraft, parking)
        txt += 'arrival,' + flightname + ',' + airport + ',,' + time.format('HH:mm') + ',' + aircraft + ',' + parking + ',\n'
        // turnaround
        var time2 = moment(time)
        time2.add(turnAround(), 'm')
        // departure
        airport = airports.randomAirport()
        flightname = randomFlightname(ltype)
        debug.print('departure', flightname, airport, time2.format('HH:mm'), aircraft, parking)
        txt += 'departure,' + flightname + ',' + airport + ',,' + time2.format('HH:mm') + ',' + aircraft + ',' + parking + ',\n'
    }
    return txt
}

var s = randomFlightboard(program.count, program.startDate, program.type)
fs.writeFileSync(program.output, s, { mode: 0o644 })
debug.print(program.output + ' written')