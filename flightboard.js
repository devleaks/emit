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
    .version('1.0.0')
    .description('generates flights from flight board (departure and arrival)')
    .option('-d, --debug', 'output extra debugging')
    .option('-p, --payload', 'Add payload column with all properties')
    .requiredOption('-f, --flightboard <file>', 'CSV flightboard')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, [])
debug.print(program.opts())

/*  Utility function: Does this arrival flight leave later on?
 */
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

/*  Generate full departure (write down CSV)
 */
function doDeparture(flight, runway) {
    const sid = airportData.randomSID(runway)
    flight.filename = 'FLIGHT-' + [flight.flight, flight.time].join("-").replace(/[:.+]/g, "-")

    flight.geojson = simulator.takeoff(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, sid)
    fs.writeFileSync(flight.filename + '_.json', JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })

    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30 })
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    const csv = tocsv.tocsv(flight.events, moment(flight.isodatetime, moment.ISO_8601), {
        queue: "aircraft",
        payload: program.payload
    })
    fs.writeFileSync(flight.filename + '.csv', csv, { mode: 0o644 })

    debug.print(flight.filename)
}

/*  Generate full arrival (write down CSV)
 */
function doArrival(flight, runway) {
    const star = airportData.randomSTAR(runway)
    flight.filename = 'FLIGHT-' + [flight.flight, flight.time].join("-").replace(/[:.+]/g, "-")

    flight.geojson = simulator.land(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, star)
    fs.writeFileSync(flight.filename + '_.json', JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })

    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30, lastPoint: true })
    fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    const csv = tocsv.tocsv(flight.events, moment(flight.isodatetime, moment.ISO_8601), {
        queue: "aircraft",
        event: 3, // 1=STAR, 2=APPROACH, 3=Touch down, 4=Exit runwa, "last" = park on time
        payload: program.payload
    })
    fs.writeFileSync(flight.filename + '.csv', csv, { mode: 0o644 })

    debug.print(flight.filename)
}

function addRefuel(arrival, departure) {
    const serviceName = "fuel"
    const serviceData = airport.config.services[serviceName]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    atime.add(serviceData["beforeOffBlocks"], "m")

    var svc = {
        "service": serviceName,
        "parking": arrival.parking,
        "qty": serviceData.randomQuantity(),
        "datetime": atime.toISOString(),
        "datetime-max": dtime.toISOString(),
        "priority": 3
    }
    SERVICES.push(svc)
    debug.print(svc)
}


function addCatering(arrival, departure) {
    const serviceName = "catering"
    const serviceData = airport.config.services[serviceName]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    atime.add(serviceData["beforeOffBlocks"], "m")

    var svc = {
        "service": serviceName,
        "parking": arrival.parking,
        "qty": serviceData.randomQuantity(),
        "datetime": atime.toISOString(),
        "datetime-max": dtime.toISOString(),
        "priority": 3
    }
    SERVICES.push(svc)
    debug.print(svc)
}

function addSewage(arrival, departure) {
    const serviceName = "sewage"
    const serviceData = airport.config.services[serviceName]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    atime.add(serviceData["beforeOffBlocks"], "m")

    var svc = {
        "service": serviceName,
        "parking": arrival.parking,
        "qty": serviceData.randomQuantity(),
        "datetime": atime.toISOString(),
        "datetime-max": dtime.toISOString(),
        "priority": 3
    }
    SERVICES.push(svc)
    debug.print(svc)
}

function addFreit(arrival, departure) {
    const serviceName = "cargo"
    const serviceData = airport.config.services[serviceName]

    const p = serviceData["freit-quantity"] // params
    const qty = Math.floor(p[0] + Math.random() * Math.abs(p[1] - p[0]))

    const stime = serviceData["freit-service-time"]
    var atime = moment(arrival.isodatetime, moment.ISO_8601).add(serviceData["afterOnBlocks"], "m")
    var dtime = moment(arrival.isodatetime, moment.ISO_8601).add(serviceData["beforeOffBlocks"], "m")

    for (var i = 0; i < qty; i++) {
        var svc = {
            "service": serviceName,
            "parking": arrival.parking,
            "qty": serviceData.randomQuantity(), // 1
            "datetime": atime.toISOString(),
            "datetime-max": dtime.toISOString(),
            "priority": 3
        }
        SERVICES.push(svc)
        atime.add(stime, "m") // time between 2 freit trolley
    }

    debug.print(svc)
}

/*  Generate turnaround services for plane
 */
function doTurnaround(arrival, departure) {
    const duration = moment(arrival.zuludatetime, moment.ISO_8601).diff(moment(departure.zuludatetime, moment.ISO_8601))

    arrival.serviceGeojson = {} // to store linestring of service
    arrival.serviceEvents = {} // to store emitted events of service

    addRefuel(arrival, departure)
    if (arrival.flight.substr(0, 1) == "C") { // is a cargo flight
        addFreit(arrival, departure)
    } else {
        addSewage(arrival, departure)
        addCatering(arrival, departure)
    }

    debug.print("turnaround", moment.duration(duration).humanize())
}

//
function doServices() {
    fs.writeFileSync('SERVICES.json', JSON.stringify(SERVICES), { mode: 0o644 })
    var trucks = service.doServices(SERVICES, airport, {
        park: true
    })
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            trucks[svc].forEach(function(truck, idx) {
                // get trip
                const fn = 'SERVICE-' + truck.getProp("service") + '-' + truck.getName()
                truck._features = truck.getFeatures()
                // add remarkable point (for sync)
                if (truck._points && truck._points.length > 0)
                    truck._features = truck._features.concat(truck._points)
                truck.geojson = geojson.FeatureCollection(truck._features)
                fs.writeFileSync(fn + '_.json', JSON.stringify(truck.geojson), { mode: 0o644 })

                // we emit it
                truck.events = emit.emitCollection(geojson.FeatureCollection(truck._features), {
                    speed: truck.getProp("speed"),
                    rate: truck.getProp("rate")
                })
                fs.writeFileSync(fn + '.json', JSON.stringify(truck.events), { mode: 0o644 })

                truck._csv = tocsv.tocsv_sync_all(truck.events, moment(), {
                    queue: "service",
                    event: "*",
                    payload: program.payload
                })
                fs.writeFileSync(fn + '.csv', truck._csv, { mode: 0o644 })
            })
        }
    }
}


/*  M A I N
 */
function doFlightboard(flightboard) {
    // cleanup datetime
    flightboard.forEach(function(flight, idx) {
        const day = flight.date == "" ? moment().format("YYYY-MM-DD") : flight.date
        flight.isodatetime = day + "T" + flight.time + ":00.000" + moment().format("Z") // flight time: 08:15, 22:55
        flight.zuludatetime = moment(flight.isodatetime, moment.ISO_8601).toISOString()
    })
    sfb = flightboard.sort((a, b) => (a.isodatetime > b.isodatetime) ? 1 : -1)
    // 1. Generate flights
    sfb.forEach(function(flight, idx) {
        var runway = airportData.randomRunway(270)
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