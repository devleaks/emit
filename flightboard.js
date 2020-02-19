const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const geojson = require('./lib/geojson-util')
const debug = require('./lib/debug.js')


program
    .version('1.0.0')
    .description('generates flights from flight board (departure and arrival)')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --flightboard <file>', 'CSV flightboard')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, ["doFlightboard", "doTurnaround", "doDeparture", "doArrival"], "main")
debug.print(program.opts())

function takeOff(flightschedule, arrival) {
    var departure = false
    var idx = 0
    while (!departure && idx < flightschedule.length) {
        var flight = flightschedule[idx]
        if (flight.plane == arrival.plane && flight.zuludatetime > arrival.zuludatetime) {
            // && flight.parking == arrival.parking
            departure = flight
        }
        idx++
    }
    return departure
}

function doDeparture(flight) {
    debug.print(flight)
}

function doArrival(flight) {
    debug.print(flight)
}

function doTurnaround(arrival, departure) {
    const duration = moment(arrival.zuludatetime, moment.ISO_8601).diff(moment(departure.zuludatetime, moment.ISO_8601))

    debug.print("turnaround", arrival, departure, moment.duration(duration).humanize())
}


function doFlightboard(flightboard) {
    // cleanup datetime
    flightboard.forEach(function(flight, idx) {
        const day = flight.date == "" ? moment().format("YYYY-MM-DD") : flight.date
        flight.isodatetime = day + "T" + flight.time + ":00.000" + moment().format("Z")
        flight.zuludatetime = moment(flight.isodatetime, moment.ISO_8601).toISOString()
    })
    sfb = flightboard.sort((a, b) => (a.isodatetime > b.isodatetime) ? 1 : -1)
    // 1. Generate flights
    sfb.forEach(function(flight, idx) {
        if (flight.move == "departure") {
            doDeparture(flight)
        } else { // arrival
            // generate arrival
            doArrival(flight)
            // does it leave later?
            var departure = takeOff(sfb, flight)
            if (departure) {
                doTurnaround(flight, departure)
            } // departure will be generated later
        }
    })
}

var features = []

if (program.flightboard) {
    const csvstring = fs.readFileSync(program.flightboard, 'utf8')
    const records = parse(csvstring, { columns: true })
    doFlightboard(records)
    /*records.forEach(function(s,idx) {
      debug.print(s)
    })*/
}

fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.output + ' written')