const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug')

const geojson = require('./lib/geojson-util')

const config = require('./sim-config-transport')
const roadsData = require('./lib/roads.js')
const trucksData = require('./lib/truck.js')

var roads = roadsData.init(config)
var trucks = trucksData.init(config)

const backoffice = require('./lib/backoffice.js')

const simulator = require('./lib/transport-lib.js')
const service = require('./lib/service-lib.js')

const emit = require('./lib/emit-lib.js')
const tocsv = require('./lib/tocsv-lib.js')


debug.init(true, [""])

const FILEPREFIX = "TRANSPORT-"


var SERVICES = []

program
    .version('1.0.0')
    .description('generates transports from transport board (departure and arrival)')
    .option('-d, --debug', 'output extra debugging')
    .option('-p, --payload', 'Add payload column with all properties')
    .requiredOption('-f, --transport-board <file>', 'CSV transport board')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


/*  Utility function: Does this arrival transport leave later on?
 */
function takeOff(transportschedule, arrival) {
    var departure = false
    var idx = 0
    while (!departure && idx < transportschedule.length) {
        var transport = transportschedule[idx]
        if (transport.move == "departure" &&
            transport.parking == arrival.parking &&
            transport.truck == arrival.truck &&
            transport.zuludatetime > arrival.zuludatetime) {
            departure = transport
        }
        idx++
    }
    return departure
}


/*  Generate full departure (write down CSV)
 */
function doDeparture(transport) {
/*    backoffice.announce("transportboard", flight.flight, announce.toISOString(true), {
        info: "scheduled",
        move: "departure",
        flight: flight.flight,
        airport: flight.airport,
        date: moment(flight.isodatetime, moment.ISO_8601).format("YYYY-MM-DD"), //may be the day after announce time...
        time: flight.time,
        parking: flight.parking
    })
*/
    transport.filename = FILEPREFIX + [transport.truck, transport.time].join("-").replace(/[:.+]/g, "-")

    transport.geojson = simulator.leave(roads, transport.truck, trucksData.randomTruckModel(), transport.parking, transport.destination)
    if (program.debug) {
        fs.writeFileSync(transport.filename + '_.json', JSON.stringify(geojson.FeatureCollection(transport.geojson.getFeatures(true))), { mode: 0o644 })
    }

    transport.events = emit.emitCollection(geojson.FeatureCollection(transport.geojson.getFeatures(true)), { speed: 30, rate: 120 })
    if (program.debug) {
        fs.writeFileSync(transport.filename + '.json', JSON.stringify(transport.events), { mode: 0o644 })
    }

    const tocsvret = tocsv.tocsv(transport.events, moment(transport.isodatetime, moment.ISO_8601), {
        queue: "truck",
        payload: program.payload
    })
    fs.writeFileSync(transport.filename + '.csv', tocsvret.csv, { mode: 0o644 })

    debug.print(transport.filename)
}


/*  Generate full arrival (write down CSV)
 */
function doArrival(transport) {
    transport.filename = FILEPREFIX + [transport.truck, transport.time].join("-").replace(/[:.+]/g, "-")

    transport.geojson = simulator.arrive(roads, transport.truck, trucksData.randomTruckModel(), transport.parking, transport.destination)
    if (program.debug) {
        fs.writeFileSync(transport.filename + '_.json', JSON.stringify(geojson.FeatureCollection(transport.geojson.getFeatures(true))), { mode: 0o644 })
    }

    transport.events = emit.emitCollection(geojson.FeatureCollection(transport.geojson.getFeatures(true)), { speed: 30, rate: 120 })
    if (program.debug) {
        fs.writeFileSync(transport.filename + '.json', JSON.stringify(transport.events), { mode: 0o644 })
    }

    const tocsvret = tocsv.tocsv(transport.events, moment(transport.isodatetime, moment.ISO_8601), {
        queue: "truck",
        event: "last", // 0=Enters Belgium, 1=Exits highway, 2=At parking
        payload: program.payload
    })
    fs.writeFileSync(transport.filename + '.csv', tocsvret.csv, { mode: 0o644 })

    debug.print(transport.filename)
}

function addFreit(arrival, departure) {
    const serviceName = "freit"
    const serviceData = config.services[serviceName]

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

    addFreit(arrival, departure)

    debug.print("turnaround", moment.duration(duration).humanize())
}

//
function doServices() {

    return // do nothing for now

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
                if (program.debug) {
                    fs.writeFileSync(fn + '_.json', JSON.stringify(truck.geojson), { mode: 0o644 })
                }

                // we emit it
                truck.events = emit.emitCollection(geojson.FeatureCollection(truck._features), {
                    speed: truck.getProp("speed"),
                    rate: truck.getProp("rate")
                })
                if (program.debug) {
                    fs.writeFileSync(fn + '.json', JSON.stringify(truck.events), { mode: 0o644 })
                }

                const tocsvret = tocsv.tocsv_sync_all(truck.events, moment(), {
                    queue: "service",
                    event: "*",
                    payload: program.payload
                })
                truck._csv = tocsvret.csv
                fs.writeFileSync(fn + '.csv', truck._csv, { mode: 0o644 })
            })
        }
    }
}

/*  M A I N
 */
function doTransportboard(transportboard) {
    // cleanup datetime
    transportboard.forEach(function(transport, idx) {
        const day = transport.date == "" ? moment().format("YYYY-MM-DD") : transport.date
        transport.isodatetime = day + "T" + transport.time + ":00.000" + moment().format("Z")
        transport.zuludatetime = moment(transport.isodatetime, moment.ISO_8601).toISOString()
    })
    sfb = transportboard.sort((a, b) => (a.isodatetime > b.isodatetime) ? 1 : -1)
    // 1. Generate transports
    sfb.forEach(function(transport, idx) {
        if (transport.move == "departure") {
            doDeparture(transport)
        } else { // arrival
            // generate arrival
            doArrival(transport)
            // does it leave later?
            var departure = takeOff(transportboard, transport)
            if (departure) {
                doTurnaround(transport, departure)
            } // departure will be generated later
        }
    })
    // now plan and generate services
    // doServices()

    backoffice.save(FILEPREFIX + 'transportboard.csv')

}

var features = []

if (program.transportBoard) {
    const csvstring = fs.readFileSync(program.transportBoard, 'utf8')
    const records = parse(csvstring, { columns: true })
    doTransportboard(records)
    /*records.forEach(function(s,idx) {
      debug.print(s)
    })*/
}