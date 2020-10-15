import fs from "fs";
import moment from "moment";
import parse from "csv-parse/lib/sync.js";
import program from "commander";
import * as debug from "./lib/debug.js";
import * as geojson from "./lib/geojson-util.js";
import * as random from "./lib/random.js";
import * as config from "./data/sim-config-transport.js";
import * as roadsData from "./lib/roads.js";
import * as trucksData from "./lib/truck.js";

var roads = roadsData.init(config)

import * as backoffice from "./lib/backoffice.js";
import * as simulator from "./lib/transport-lib.js";
import * as service from "./lib/service-lib.js";
import * as emit from "./lib/emit-lib.js";
import * as tocsv from "./lib/tocsv-lib.js";


debug.init(true, [""])

var SERVICES = []

program
    .version("1.1.0")
    .description("generates transports from transport board (departure and arrival)")
    .option("-d, --debug", "output extra debugging")
    .option("-p, --payload", "Add payload column with all properties")
    .requiredOption("-f, --transport-board <file>", "CSV transport board")
    .option("-o, --output <file>", "Save to file, default to out.json", "out.json")
    .option("-t, --file-prefix <path>", "Prefix (including directories) for file generation", "TRANSPORT-")
    .parse(process.argv)

debug.init(program.debug, ["doArrival", "doDeparture"])
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
    transport.filename = program.filePrefix + [transport.truck, transport.time].join("-").replace(/[:.+]/g, "-")

    var announce = moment(transport.isodatetime, moment.ISO_8601).subtract(config.simulation["warehouse-preannounce"], "minutes")
    backoffice.announce("transport", transport.truck, announce.toISOString(true), {
        info: "scheduled",
        move: "departure",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        date: moment(transport.isodatetime, moment.ISO_8601).format("YYYY-MM-DD"), //may be the day after announce time...
        time: transport.time,
        parking: transport.parking
    })

    transport.geojson = simulator.leave(roads, transport.truck, trucksData.randomTruckModel(), transport.parking, transport.destination, transport.handler)
    if (program.debug) {
        fs.writeFileSync(transport.filename + "_.json", JSON.stringify(geojson.FeatureCollection(transport.geojson.getFeatures(true))), { mode: 0o644 })
    }

    transport.events = emit.emitCollection(geojson.FeatureCollection(transport.geojson.getFeatures(true)), { speed: 30, rate: 120 })
    if (program.debug) {
        fs.writeFileSync(transport.filename + ".json", JSON.stringify(transport.events), { mode: 0o644 })
    }

    // add an actual ramdom delay to the transport
    var extradelay = random.randomValue(config.simulation["departure-delays"])
    // first if arrival was late, we postpone departure also (not if transport arrived early)
    transport.actualdeptime = moment(transport.isodatetime, moment.ISO_8601)
    if (transport.hasOwnProperty("delay")) {
        if (transport.delay > 0) {
            debug.print("Departure has delay because of late arrival", transport.truck, transport.delay, extradelay)
            transport.actualdeptime.add(transport.delay, "minutes")
        }
        /*
            departure.arrtransportsched = arrival.isodatetime
            departure.arrtransportactual = arrival.actualarrtime
        */
        // if previous transport was delayed, as soon as it landed, we can annouce the delay of this transport
        var landannouncets = moment(transport.arrtransportactual)
        backoffice.announce("transport", transport.truck, landannouncets.toISOString(true), {
            info: "planned",
            move: "departure",
            name: transport.truck,
            handler: transport.handler,
            destination: transport.destination,
            date: transport.actualdeptime.format("DD/MM"),
            time: transport.actualdeptime.format("HH:mm"),
            parking: transport.parking
        })
    }
    transport.actualdeptime.add(extradelay, "minutes") // add a little, unplanned, extra torture to departure

    const tocsvret = tocsv.tocsv(transport.events, moment(transport.actualdeptime), {
        queue: "truck",
        payload: program.payload
    })
    fs.writeFileSync(transport.filename + ".csv", tocsvret.csv, { mode: 0o644 })

    var annoucets = moment(transport.isodatetime, moment.ISO_8601)
    annoucets.subtract(geojson.randomValue(config.simulation["warehouse-planned-timeframe"]), "minutes")

    var arrv = moment(transport.actualdeptime)
    var arrguess = moment(transport.actualdeptime)
    var randomdelay = geojson.randomValue(config.simulation["warehouse-planned-uncertainly"], true)
    arrguess.add(randomdelay, "seconds")
    backoffice.announce("transport", transport.truck, annoucets.toISOString(true), {
        info: "planned",
        move: "departure",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        date: arrguess.format("DD/MM"),
        time: arrguess.format("HH:mm"),
        parking: transport.parking
    })

    backoffice.announce("transport", transport.truck, arrv.toISOString(true), {
        info: "actual",
        move: "departure",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        date: arrv.format("DD/MM"),
        time: arrv.format("HH:mm"),
        parking: transport.parking
    })

    backoffice.announce("parking", transport.parking.toString(), arrv.toISOString(true), {
        info: "parking",
        move: "available",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        parking: transport.parking
    })

    debug.print(transport.filename)
}


/*  Generate full arrival (write down CSV)
 */
function doArrival(transport) {
    transport.filename = program.filePrefix + [transport.truck, transport.time].join("-").replace(/[:.+]/g, "-")

    var announce = moment(transport.isodatetime, moment.ISO_8601).subtract(config.simulation["warehouse-preannounce"], "minutes")
    backoffice.announce("transport", transport.truck, announce.toISOString(true), {
        info: "scheduled",
        move: "arrival",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        date: moment(transport.isodatetime, moment.ISO_8601).format("YYYY-MM-DD"), //may be the day after announce time...
        time: transport.time,
        parking: transport.parking
    })

    transport.geojson = simulator.arrive(roads, transport.truck, trucksData.randomTruckModel(), transport.parking, transport.destination, transport.handler)
    if (program.debug) {
        fs.writeFileSync(transport.filename + "_.json", JSON.stringify(geojson.FeatureCollection(transport.geojson.getFeatures(true))), { mode: 0o644 })
    }

    transport.events = emit.emitCollection(geojson.FeatureCollection(transport.geojson.getFeatures(true)), { speed: 30, rate: 120 })
    if (program.debug) {
        fs.writeFileSync(transport.filename + ".json", JSON.stringify(transport.events), { mode: 0o644 })
    }

    // We will build a loop that will report an updated ETA every "more or less" eta-report minutes.

    // add an actual ramdom delay to the arrival time
    transport.delay = random.randomValue(config.simulation["arrival-delays"])
    debug.print(transport.truck, "has delay", transport.delay)
    transport.actualarrtime = moment(transport.isodatetime, moment.ISO_8601)
    transport.actualarrtime.add(transport.delay, "minutes")

    var etareporttime = moment(transport.actualarrtime)
    etareporttime.subtract(config.simulation["eta-preannounce"], "minutes")

    //console.log("delay / scheduled / actual", transport.delay, transport.isodatetime, transport.actualarrtime.toISOString(true))

    // we start with scheduled ETA
    var etareportvalue = moment(transport.isodatetime, moment.ISO_8601)

    while (etareporttime.isBefore(transport.actualarrtime)) {

        // fluctuate ETA time but tries to "converge" to actualarrtime
        var etavariation = Math.abs(random.randomValue(config.simulation["eta-variation"]))
        if (etavariation > 0) {
            if (etareportvalue.isBefore(transport.actualarrtime)) {
                etareportvalue.add(etavariation, "minutes")
                // console.log("planned ADD", etavariation, etareportvalue.toISOString(true), transport.actualarrtime.toISOString(true))
            } else {
                etareportvalue.subtract(etavariation, "minutes")
                // console.log("planned SUB", etavariation, etareportvalue.toISOString(true), transport.actualarrtime.toISOString(true))
            }
        }
        backoffice.announce("transport", transport.truck, etareporttime.toISOString(true), {
            info: "planned",
            move: "arrival",
            name: transport.truck,
            handler: transport.handler,
            destination: transport.destination,
            date: etareportvalue.format("DD/MM"),
            time: etareportvalue.format("HH:mm"),
            parking: transport.parking
        })
        // console.log("planned", etareporttime.toISOString(true), etareportvalue.toISOString(true))

        // next ETA report time:
        etareporttime.add(random.randomValue(config.simulation["eta-report"]), "minutes")
    }

    const tocsvret = tocsv.tocsv(transport.events, moment(transport.actualarrtime), {
        queue: "truck",
        event: "last", // 0=Enters Belgium, 1=Exits highway, 2=At parking
        payload: program.payload
    })
    fs.writeFileSync(transport.filename + ".csv", tocsvret.csv, { mode: 0o644 })


    /*  Planned is announced in ETA loop above
    */
    var arrv = moment(transport.actualarrtime)
    backoffice.announce("transport", transport.truck, arrv.toISOString(true), {
        info: "actual",
        move: "arrival",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        date: arrv.format("DD/MM"),
        time: arrv.format("HH:mm"),
        parking: transport.parking
    })
    // console.log("actual", arrv.toISOString(), arrv.toISOString())

    backoffice.announce("parking", transport.parking.toString(), arrv.toISOString(true), {
        info: "parking",
        move: "busy",
        name: transport.truck,
        handler: transport.handler,
        destination: transport.destination,
        parking: transport.parking
    })

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
    fs.writeFileSync(program.filePrefix + "services.json", JSON.stringify(SERVICES), { mode: 0o644 })
    var trucks = service.doServices(SERVICES, airport, {
        park: true
    })
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            trucks[svc].forEach(function(truck, idx) {
                // get trip
                const fn = program.filePrefix + truck.getProp("service") + "-" + truck.getName()
                truck._features = truck.getFeatures()
                // add remarkable point (for sync)
                if (truck._points && truck._points.length > 0)
                    truck._features = truck._features.concat(truck._points)
                truck.geojson = geojson.FeatureCollection(truck._features)
                if (program.debug) {
                    fs.writeFileSync(fn + "_.json", JSON.stringify(truck.geojson), { mode: 0o644 })
                }

                // we emit it
                truck.events = emit.emitCollection(geojson.FeatureCollection(truck._features), {
                    speed: truck.getProp("speed"),
                    rate: truck.getProp("rate")
                })
                if (program.debug) {
                    fs.writeFileSync(fn + ".json", JSON.stringify(truck.events), { mode: 0o644 })
                }

                const tocsvret = tocsv.tocsv_sync_all(truck.events, moment(), {
                    queue: "service",
                    event: "*",
                    payload: program.payload
                })
                truck._csv = tocsvret.csv
                fs.writeFileSync(fn + ".csv", truck._csv, { mode: 0o644 })
            })
        }
    }
}

/*  M A I N
 */
function doTransportboard(transportboard) {
    // cleanup datetime
    transportboard.forEach(function(transport) {
        const day = transport.date == "" ? moment().format("YYYY-MM-DD") : transport.date
        transport.isodatetime = day + "T" + transport.time + ":00.000" + moment().format("Z")
        transport.zuludatetime = moment(transport.isodatetime, moment.ISO_8601).toISOString()
    })
    let sfb = transportboard.sort((a, b) => (a.isodatetime > b.isodatetime) ? 1 : -1)
    // 1. Generate transports
    sfb.forEach(function(transport) {
        if (transport.move == "departure") {
            doDeparture(transport)
        } else { // arrival
            // generate arrival
            doArrival(transport)
            // does it leave later?
            var departure = takeOff(transportboard, transport)
            if (departure) {
                // we transport the delay of the arrival to the departure:
                if (transport.hasOwnProperty("delay")) {
                    if (transport.delay > 0) {
                        departure.delay = transport.delay
                    }
                }
                doTurnaround(transport, departure)
            } // departure will be generated later
        }
    })
    // now plan and generate services
    // doServices()

    backoffice.save(program.filePrefix + "transportboard.csv")

}

var features = []

if (program.transportBoard) {
    const csvstring = fs.readFileSync(program.transportBoard, "utf8")
    const records = parse(csvstring, { columns: true })
    doTransportboard(records)
    /*records.forEach(function(s,idx) {
      debug.print(s)
    })*/
}