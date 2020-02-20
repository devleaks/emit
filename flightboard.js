const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const geojson = require('./lib/geojson-util')
const debug = require('./lib/debug.js')
const simulator = require('./lib/movement-lib.js')
const tocsv = require('./lib/tocsv-lib.js')
const service = require('./lib/service-lib.js')

const config = require('./sim-config')

var airport = simulator.readAirport(config)
const defaults = simulator.makeDefaults(config, airport)

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
        if (flight.plane == arrival.plane
            // && flight.parking == arrival.parking)
            &&
            flight.zuludatetime > arrival.zuludatetime) {
            departure = flight
        }
        idx++
    }
    return departure
}

function doDeparture(flight, runway) {
    const sid = simulator.randomSID(airport, runway)
    flight.geojson = simulator.takeoff(airport, defaults.aircraft, flight.parking, runway, sid)
    flight.filename = [flight.flight, flight.isodatetime].join("-").replace(/[:.+]/g, "-")
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })
    debug.print(flight.filename)
}

function doArrival(flight, runway) {
    const star = simulator.randomSTAR(airport, runway)
    flight.geojson = simulator.land(airport, defaults.aircraft, flight.parking, runway, star)
    flight.filename = [flight.flight, flight.isodatetime].join("-").replace(/[:.+]/g, "-")
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })
    debug.print(flight.filename)
}

function doTurnaround(arrival, departure) {
    const duration = moment(arrival.zuludatetime, moment.ISO_8601).diff(moment(departure.zuludatetime, moment.ISO_8601))
    var services = []

    services.push({ "service": "fuel", "parking": arrival.parking, "qty": (4000 + Math.floor(Math.random() * 10) * 100), "datetime": null, "priority": 3 })
    services.push({ "service": "catering", "parking": arrival.parking, "qty": Math.floor(Math.random() * 2), "datetime": null, "priority": 3 })

    var trucks = service.doServices(services, airport, {})
    var features = []
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            const truck = trucks[svc]
            var f = truck.getFeatures()
            features = features.concat(f)
            // add remarkable point
            var p = truck._points
            if (p && p.length > 0)
                features = features.concat(p)
        }
    }
    fs.writeFileSync(arrival.filename + 'SERVICE.json', JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
    debug.print("turnaround", moment.duration(duration).humanize(), services.length)
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
    const runway = "22L"
    sfb.forEach(function(flight, idx) {
        if (flight.move == "departure") {
            doDeparture(flight, runway)
        } else { // arrival
            // generate arrival
            doArrival(flight, runway)
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