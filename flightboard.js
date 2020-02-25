const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug')

const geojson = require('./lib/geojson-util')

const simulator = require('./lib/movement-lib.js')
const service = require('./lib/service-lib.js')

const emit = require('./lib/emit-lib.js')
const tocsv = require('./lib/tocsv-lib.js')

const airportData = require('./lib/airport.js')
const aircraftData = require('./lib/aircraft')

debug.init(true, [""])

const config = require('./sim-config')

var airport = airportData.init(config)
var aircraft = aircraftData.init(config.aircrafts)

var SERVICES = []

program
    .version('1.1.0')
    .description('generates flights from flight board (departure and arrival)')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --flightboard <file>', 'CSV flightboard')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

function takeOff(flightschedule, arrival) {
    var departure = false
    var idx = 0
    while (!departure && idx < flightschedule.length) {
        var flight = flightschedule[idx]
        if (((flight.plane &&
                    flight.plane == arrival.plane) ||
                (flight.parking &&
                    flight.parking == arrival.parking)) &&
            flight.zuludatetime > arrival.zuludatetime) {
            departure = flight
        }
        idx++
    }
    return departure
}

function doDeparture(flight, runway) {
    const sid = airportData.randomSID(runway)
    flight.geojson = simulator.takeoff(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, sid)
    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30 })

    flight.filename = [flight.flight, flight.isodatetime].join("-").replace(/[:.+]/g, "-")
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    const csv = tocsv.tocsv(flight.events, moment(flight.isodatetime, moment.ISO_8601), {
        queue: "aircraft"
    })
    fs.writeFileSync(flight.filename + '.csv', csv, { mode: 0o644 })

    debug.print(flight.filename)
}

function doArrival(flight, runway) {
    const star = airportData.randomSTAR(runway)
    flight.geojson = simulator.land(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, star)
    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30 })

    flight.filename = [flight.flight, flight.isodatetime].join("-").replace(/[:.+]/g, "-")
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    const csv = tocsv.tocsv(flight.events, moment(flight.isodatetime, moment.ISO_8601), {
        queue: "aircraft"
    })
    fs.writeFileSync(flight.filename + '.csv', csv, { mode: 0o644 })
    debug.print(flight.filename)
}

function addRefuel(arrival, delay) {
    var stime = moment(arrival.isodatetime, moment.ISO_8601)
    stime.add(delay, "m")
    var svc = { "service": "fuel", "parking": arrival.parking, "qty": (4000 + Math.floor(Math.random() * 10) * 100), "datetime": stime.toISOString(), "priority": 3 }
    SERVICES.push(svc)
    debug.print(svc)
}


function addCatering(arrival, delay) {
    var stime = moment(arrival.isodatetime, moment.ISO_8601)
    stime.add(delay, "m")
    var svc = { "service": "catering", "parking": arrival.parking, "qty": 1 + Math.floor(Math.random() * 2), "datetime": stime.toISOString(), "priority": 3 }
    SERVICES.push(svc)
    debug.print(svc)
}


function doTurnaround(arrival, departure) {
    const duration = moment(arrival.zuludatetime, moment.ISO_8601).diff(moment(departure.zuludatetime, moment.ISO_8601))
    var csv = ''

    arrival.serviceGeojson = {}
    arrival.serviceEvents = {}
    addRefuel(arrival, 25)
    addCatering(arrival, 10)
    debug.print("turnaround", moment.duration(duration).humanize())
}

function doServices() {
    var trucks = service.doServices(SERVICES, airport, {})
    var features = []
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {

            trucks[svc].forEach(function(truck, idx) {
                var f = truck.getFeatures()
                features = features.concat(f)
                // add remarkable point
                var p = truck._points
                if (p && p.length > 0)
                    features = features.concat(p)
            })
        }
    }

    var f = geojson.FeatureCollection(features)
    var emissions = emit.emitCollection(f, { speed: 20, rate: 60, park: true, payload: true })

    const csv = tocsv.tocsv(emissions, moment(), {
        queue: "service"
    })

    fs.writeFileSync('SERVICE.csv', csv, { mode: 0o644 })
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
    // now plan and generate services
    doServices()
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