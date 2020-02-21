const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug.js')

const geojson = require('./lib/geojson-util')

const simulator = require('./lib/movement-lib.js')
const service = require('./lib/service-lib.js')

const emit = require('./lib/emit-lib.js')
const tocsv = require('./lib/tocsv-lib.js')

const airportData = require('./lib/airport.js')
const aircraftData = require('./lib/aircraft.js')

debug.init(true, [""], "main")

const config = require('./sim-config')

var airport = airportData.init(config)
var aircraft = aircraftData.init(config.aircrafts)

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
        if (flight.plane
            && flight.plane == arrival.plane
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
    const sid = airportData.randomSID(runway)
    flight.geojson = simulator.takeoff(airport, aircraftData.randomAircraft(), flight.parking, runway, sid)
    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), {speed: 30, rate: 30})

    flight.filename = [flight.flight, flight.isodatetime].join("-").replace(/[:.+]/g, "-")
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    const csv = tocsv.tocsv(flight.events, moment(flight.isodatetime, moment.ISO_8601), {
        name: flight.flight,
        queue: "aircraft"
    })
    fs.writeFileSync(flight.filename + '.csv', csv, { mode: 0o644 })

    debug.print(flight.filename)
}

function doArrival(flight, runway) {
    const star = airportData.randomSTAR(runway)
    flight.geojson = simulator.land(airport, aircraftData.randomAircraft(), flight.parking, runway, star)
    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), {speed: 30, rate: 30})

    flight.filename = [flight.flight, flight.isodatetime].join("-").replace(/[:.+]/g, "-")
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    const csv = tocsv.tocsv(flight.events, moment(flight.isodatetime, moment.ISO_8601), {
        name: flight.flight,
        queue: "aircraft"
    })
    fs.writeFileSync(flight.filename + '.csv', csv, { mode: 0o644 })
    debug.print(flight.filename)
}

function doRefuel(arrival, delay) {
    var stime = moment(arrival.isodatetime, moment.ISO_8601)
    stime.add(delay, "m")
    var services = []
    services.push({ "service": "fuel", "parking": arrival.parking, "qty": (4000 + Math.floor(Math.random() * 10) * 100), "datetime": stime.toISOString(), "priority": 3 })
    var trucks = service.doServices(services, airport, {})
    var features = []
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            const truck = trucks[svc]
            var f = truck.getFeatures()
            if(f.length > 0)
                features = features.concat(f)
            // add remarkable point
            var p = truck._points
            if (p && p.length > 0)
                features = features.concat(p)
        }
    }
    var f = geojson.FeatureCollection(features)
    arrival.serviceGeojson["fuel"] = geojson.cleanCopy(f)
    arrival.serviceEvents["fuel"] = emit.emitCollection(f, {speed: 20, rate: 60, park: true, payload: true})

    const csv = tocsv.tocsv(arrival.serviceEvents["fuel"], stime, {
        name: "fuel",
        queue: "service"
    })
    return csv
}


function doCatering(arrival, delay) {
    var stime = moment(arrival.isodatetime, moment.ISO_8601)
    stime.add(delay, "m")
    var services = []
    services.push({ "service": "catering", "parking": arrival.parking, "qty": Math.floor(Math.random() * 2), "datetime": stime.toISOString(), "priority": 3 })
    var trucks = service.doServices(services, airport, {})
    var features = []
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            const truck = trucks[svc]
            var f = truck.getFeatures()
            if(f.length > 0)
                features = features.concat(f)
            // add remarkable point
            var p = truck._points
            if (p && p.length > 0)
                features = features.concat(p)
        }
    }
    var f = geojson.FeatureCollection(features)
    arrival.serviceGeojson["catering"] = geojson.cleanCopy(f)
    arrival.serviceEvents["catering"] = emit.emitCollection(f, {speed: 20, rate: 60, park: true})

    const csv = tocsv.tocsv(arrival.serviceEvents["catering"], stime, {
        name: "catering",
        queue: "service"
    })
    return csv
}


function doTurnaround(arrival, departure) {
    const duration = moment(arrival.zuludatetime, moment.ISO_8601).diff(moment(departure.zuludatetime, moment.ISO_8601))
    var csv = ''

    arrival.serviceGeojson = {}
    arrival.serviceEvents  = {}
    csv += doRefuel(arrival, 25)
    csv += doCatering(arrival, 10)

    fs.writeFileSync(arrival.filename + 'SERVICE.csv', csv, { mode: 0o644 })

    debug.print("turnaround", moment.duration(duration).humanize())
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