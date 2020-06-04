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
    .description('generates random initial situation and departures')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.csv', "out.csv")
    .option('-c, --cargo <cargo>', 'count of cargo departures')
    .option('-p, --pax <pax>', 'count of pax departures')
    .option('-s, --start-date <date>', 'start date of event reporting, default to now', now5.toISOString())
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

function rndInt(n) {
    return Math.floor(Math.random() * n)
}

function nextFlight(n = 5) {
    const p = config.simulation["time-between-flights"]
    const m = config.simulation["min-flight-distance"]
    if (!m) {
        m = n
    }
    let t = p[0] + m * rndInt(Math.round(Math.abs(p[1]-p[0]) / m))
    if (t < m) {
        t = m
    }
    return t
}

function busyCount(type) {
    if((type == "PAX") && program.pax) {
        return program.pax
    }
    if((type == "CARGO") && program.cargo) {
        return program.cargo
    }
    // else: random
    const p = (type == "PAX") ? config.originalSituation["numPax"] : config.originalSituation["numCargo"]
    return p[0] + rndInt(Math.abs(p[1]-p[0]))
}

function busyTime(type) {
    const p = (type == "PAX") ? config.originalSituation["departurePax"] : config.originalSituation["departureCargo"]
    return p[1] + rndInt(Math.abs(p[2]-p[1]))
}



function turnAround(type = false) {
    const p = config.simulation["turnaround-time"]
    return p[0] + 5 * rndInt(Math.round(Math.abs(p[1]-p[0]) / 5))
}

function randomFlightboard(cnt, startdate, type = false) {
    var txt = 'move,flight,airport,date,time,plane,parking,comment\n'
    var time = startdate ? moment(startdate) : moment()

    var numPax = busyCount("PAX")
    var paxTime = moment(time)
    paxTime.add(config.originalSituation["departurePax"][0], "m")
    for (var i = 0; i < numPax; i++) {
        var parking = airportData.randomParking(airportData.randomApron("PAX"))
        var aircraft = aircraftData.randomAircraftICAO()
        var airport = airports.randomAirport()

        flightname = aircraftData.randomFlightname("PAX", true)
        debug.print('departure', flightname, airport, paxTime.format('HH:mm'), aircraft, parking)
        txt += 'departure,' + flightname + ',' + airport + ',' + paxTime.format('YYYY-MM-DD') + ',' + paxTime.format('HH:mm') + ',' + aircraft + ',' + parking + ',\n'
        paxTime.add(busyTime("PAX"), "m")
    }

    var numPax = busyCount("CARGO")
    var cargoTime = moment(time)
    cargoTime.add(config.originalSituation["departureCargo"][0], "m")
    for (var i = 0; i < numPax; i++) {
        var parking = airportData.randomParking(airportData.randomApron("CARGO"))
        var aircraft = aircraftData.randomAircraftICAO()
        var airport = airports.randomAirport()

        flightname = aircraftData.randomFlightname("CARGO", true)
        debug.print('departure', flightname, airport, cargoTime.format('HH:mm'), aircraft, parking)
        txt += 'departure,' + flightname + ',' + airport + ',' + cargoTime.format('YYYY-MM-DD') + ',' + paxTime.format('HH:mm') + ',' + aircraft + ',' + parking + ',\n'
        cargoTime.add(busyTime("PAX"), "m")
    }


    return txt
}

var s = randomFlightboard(program.count, program.startDate, program.type)
fs.writeFileSync(program.output, s, { mode: 0o644 })
debug.print(program.output + ' written')