import fs from "fs";
import moment from "moment";
import parse from "csv-parse/lib/sync.js";
import program from "commander";
import * as debug from "./lib/debug.js";
import * as geojson from "./lib/geojson-util.js";
import * as random from "./lib/random.js";
import * as simulator from "./lib/movement-lib.js";
import * as service from "./lib/service-lib.js";
import * as emit from "./lib/emit-lib.js";
import * as tocsv from "./lib/tocsv-lib.js";
import * as backoffice from "./lib/backoffice.js";
import * as airportData from "./lib/airport.js";
import * as aircraftData from "./lib/aircraft.js";

import { CODELEN } from "./lib/aircraft.js"

debug.init(true, [""])

import * as config from "./data/sim-config.js";

var airport = airportData.init(config)
var aircraft = aircraftData.init(config.aircrafts)

let FILEPREFIX = "FLIGHT-"

program
    .version("1.4.0")
    .description("generates flights from flight board (departure and arrival)")
    .option("-d, --debug", "output extra debugging")
    .option("-p, --payload", "Add payload column with all properties")
    .option("-s, --starting-situation", "Flightboard has departure only, original situation must be set up", false)
    .requiredOption("-f, --flightboard <file>", "CSV flightboard")
    .option("-t, --file-prefix <path>", "Prefix (including directories) for file generation", FILEPREFIX)
    .option("-o, --output <file>", "Save to file, default to out.json", "out.json")
    .parse(process.argv)

debug.init(program.debug, [])
debug.print(program.opts())


var situationSetupTime = false
var firstFlightDeparture = false
var parkedAircraft = ""
var lastDeparture = ""
var lastArrival = ""

/*  Utility function: Does this arrival flight leave later on?
 */
function findDepartureForArrival(flightschedule, arrival) {
    var departure = false
    var idx = 0
    while (!departure && idx < flightschedule.length) {
        var flight = flightschedule[idx]
        if (((flight.plane && flight.plane == arrival.plane) ||
                (flight.parking && flight.parking == arrival.parking)) &&
            flight.zuludatetime > arrival.zuludatetime
        ) {
            departure = flight
        }
        idx++
    }
    return departure
}

function findArrivalForDeparture(flightschedule, departure) {
    var arrvl = false
    var idx = 0
    while (!arrvl && idx < flightschedule.length) {
        var flight = flightschedule[idx]
        if (((flight.plane && flight.plane == departure.plane) ||
                (flight.parking && flight.parking == departure.parking)) &&
            flight.zuludatetime < departure.zuludatetime
        ) {
            arrvl = flight
        }
        idx++
    }
    return arrvl
}

function addDelay(t, f) {
    return (f.hasOwnProperty("delay") && f.delay > 0) ? moment(t).add(f.delay, "minutes") : t
}


/*  Generate full departure (write down CSV)
 */
function doDeparture(flight, runway, arrival) {
    const sid = airportData.randomSID(runway)
    flight.filename = program.filePrefix + [flight.flight, flight.time].join("-").replace(/[:.+]/g, "-")

    // annouce flight at its scheduled time.
    var announce;
    if (program.startingSituation) {
        if (!situationSetupTime) { // first flight, assuming they are ordered by flight time.
            // we setup the scene "planned announce" time in advance. We take the largest possible value given randomness and uncertainty.
            const delay1 = config.simulation["aodb-planned-timeframe"] // mins
            const delay2 = config.simulation["aodb-planned-uncertainly"] // secs
            var maxtime = delay1[0] + Math.abs(delay1[1] - delay1[0]) + Math.ceil(delay2 / 60) // mins
            situationSetupTime = moment(flight.isodatetime, moment.ISO_8601).subtract(maxtime, "minutes")
            debug.print("Situation setup time", situationSetupTime.toISOString(true))
        }
        announce = moment(situationSetupTime)
    } else {
        if (firstFlightDeparture && !situationSetupTime) {
            console.log("doDeparture: First flight is departure, don't forget to set --starting-situation flag if applicable.")
            console.log("doDeparture: If program fails, restart with --starting-situation flag. Program does not take responsibility for this.")
        }
        announce = moment(flight.isodatetime, moment.ISO_8601).subtract(config.simulation["aodb-preannounce"], "minutes")
    }
    backoffice.announce("flightboard", flight.flight, announce.toISOString(true), {
        info: "scheduled",
        move: "departure",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        date: moment(flight.isodatetime, moment.ISO_8601).format("YYYY-MM-DD"), //may be the day after announce time...
        time: flight.time,
        parking: flight.parking
    })
    if (!arrival) { // we block packing as well  since no arrival flight blocked it. Time is when situatin is setup
        backoffice.announce("parking", flight.parking.toString(), situationSetupTime.toISOString(true), {
            info: "parking",
            move: "busy",
            flight: flight.flight,
            operator: flight.flight.substr(0,CODELEN),
            airport: flight.airport,
            parking: flight.parking
        })
        // add plane on parking
        var parking = airportData.parkingFeature(flight.parking)
        if (parking) {
            parkedAircraft += "aircraft," + flight.plane + "," + situationSetupTime.toISOString(true) + "," + parking.geometry.coordinates[1] + "," + parking.geometry.coordinates[0] + ",,0,null,''" + "\n"
        } else {
            console.warn("doDeparture: parking not found", flight.parking)
        }
    }

    // fly it
    var tohs = [/*
        { hold_time: 150, takeoff_hold: 10 },
        { hold_time: 150, takeoff_hold: 25 },
        { hold_time: 150, takeoff_hold: 30 }
    */]
    flight.geojson = simulator.takeoff(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, sid, flight.flight, tohs)
    if(! flight.geojson) {
        console.log("doDeparture", flight, runway, arrival)
        console.error("doDeparture", "could not generate takeoff")
        return
    }
    if (program.debug)
        fs.writeFileSync(flight.filename + "_.json", JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })

    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30 })
    if (program.debug)
        fs.writeFileSync(flight.filename + ".json", JSON.stringify(flight.events), { mode: 0o644 })

    // first if arrival was late, we postpone departure also (not if flight arrived early)
    flight.actualdeptime = moment(flight.isodatetime, moment.ISO_8601)
    if (flight.hasOwnProperty("delay")) {
        if (flight.delay > 0) {
            debug.print("Departure has delay because of late arrival", flight.delay)
            flight.actualdeptime.add(flight.delay, "minutes")
        }
        /*
            departure.arrflightsched = arrival.isodatetime
            departure.arrflightactual = arrival.actualarrtime
        */
        // if previous flight was delayed, as soon as it landed, we can annouce the delay of this flight
        var landannouncets = moment(flight.arrflightactual)
        backoffice.announce("flightboard", flight.flight, landannouncets.toISOString(true), {
            info: "planned",
            move: "departure",
            flight: flight.flight,
            operator: flight.flight.substr(0,CODELEN),
            airport: flight.airport,
            date: flight.actualdeptime.format("DD/MM"),
            time: flight.actualdeptime.format("HH:mm"),
            parking: flight.parking
        })
    }

    if(lastDeparture != "") { // distance from lastDeparture must be at least 2.5m
        const mintime = config.queues.takeoff.mintime
        const apart = Math.abs( moment.duration(lastDeparture.diff(flight.actualdeptime)).asSeconds() )
        if(apart < mintime) { // too close, need to delay departure to ensure they are at least mintime apart...
            debug.print("departure too close, delaying...", mintime, apart)
            flight.actualdeptime = lastDeparture.add(mintime - apart, "seconds")
        }
    }
    // add an actual ramdom delay to the flight
    var extradelay = random.randomValue(config.simulation["departure-delays"])
    flight.actualdeptime.add(extradelay, "minutes") // add a little, unplanned, extra torture to departure

    lastDeparture = flight.actualdeptime

    const tocsvret = tocsv.tocsv(flight.events, moment(flight.actualdeptime), {
        queue: "aircraft",
        payload: program.payload
    })
    debug.print("departure sync events", tocsvret.syncevents)
    fs.writeFileSync(flight.filename + ".csv", tocsvret.csv, { mode: 0o644 })

    // departure is event 0. We add a little randomness around it, and a little randomness at the time it is annouceed 20-60 min in advance)
    var annoucets = moment(tocsvret.syncevents["pushback"])
    annoucets.subtract(geojson.randomValue(config.simulation["aodb-planned-timeframe"]), "minutes")

    var dept = moment(tocsvret.syncevents["pushback"])
    var deptguess = moment(tocsvret.syncevents["pushback"])
    var randomdelay = geojson.randomValue(config.simulation["aodb-planned-uncertainly"], true)
    deptguess.add(randomdelay, "seconds")
    backoffice.announce("flightboard", flight.flight, annoucets.toISOString(true), {
        info: "planned",
        move: "departure",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        date: deptguess.format("DD/MM"),
        time: deptguess.format("HH:mm"),
        parking: flight.parking
    })

    backoffice.announce("flightboard", flight.flight, tocsvret.syncevents["pushback"], {
        info: "actual",
        move: "departure",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        date: dept.format("DD/MM"),
        time: dept.format("HH:mm"),
        parking: flight.parking
    })

    backoffice.announce("parking", flight.parking.toString(), tocsvret.syncevents["pushback"], {
        info: "parking",
        move: "available",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        parking: flight.parking
    })
}

/*  Generate full arrival (write down CSV)
 */
function doArrival(flight, runway) {
    const star = airportData.randomSTAR(runway)
    flight.filename = program.filePrefix + [flight.flight, flight.time].join("-").replace(/[:.+]/g, "-")

    var announce = moment(flight.isodatetime, moment.ISO_8601).subtract(config.simulation["aodb-preannounce"], "minutes")
    backoffice.announce("flightboard", flight.flight, announce.toISOString(true), {
        info: "scheduled",
        move: "arrival",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        date: moment(flight.isodatetime, moment.ISO_8601).format("YYYY-MM-DD"), //may be the day after announce time...
        time: flight.time,
        parking: flight.parking
    })

    // fly it
    const hps = [/*
        { hold_time: 240 },
        { hold_time: 240 },
        { hold_time: 240 }
    */]
    flight.geojson = simulator.land(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, star, flight.flight, hps)

    if(! flight.geojson) {
        console.log("doArrival", flight, runway)
        console.error("doArrival", "could not generate land")
        return
    }
    if (!flight.geojson)
    if (program.debug)
        fs.writeFileSync(flight.filename + "_.json", JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })

    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30, lastPoint: true })
    if (program.debug)
        fs.writeFileSync(flight.filename + ".json", JSON.stringify(flight.events), { mode: 0o644 })

    flight.actualarrtime = moment(flight.isodatetime, moment.ISO_8601)
    if(lastArrival != "") { // distance from lastArrival must be at least 2.5m
        const mintime = config.queues.landing.mintime
        const apart = Math.abs( moment.duration(lastArrival.diff(flight.actualarrtime)).asSeconds() )
        if(apart < mintime) { // too close, need to delay departure to ensure they are at least mintime apart...
            debug.print("arrival too close, delaying...", mintime, apart)
            flight.actualarrtime = lastArrival.add(mintime - apart, "seconds")
        }
    }
    // add an actual ramdom delay to the flight
    flight.delay = random.randomValue(config.simulation["arrival-delays"])
    flight.actualarrtime.add(flight.delay, "minutes")

    lastArrival = flight.actualarrtime

    const tocsvret = tocsv.tocsv(flight.events, moment(flight.actualarrtime), { // send a copy of time because it will vbe modified in tocsv
        queue: "aircraft",
        event: "touchdown", // "last" = park on time
        payload: program.payload
    })
    fs.writeFileSync(flight.filename + ".csv", tocsvret.csv, { mode: 0o644 })

    debug.print("arrival sync events", tocsvret.syncevents)

    // arrival"s touch down is event 3. We add a little randomness around it, and a little randomness at the time it is annouceed
    var annoucets = moment(tocsvret.syncevents["enter"])
    annoucets.subtract(geojson.randomValue(config.simulation["aodb-planned-timeframe"]), "minutes")

    var arrv = moment(tocsvret.syncevents["touchdown"], moment.ISO_8601)
    var arrguess = moment(tocsvret.syncevents["touchdown"], moment.ISO_8601)
    var randomdelay = geojson.randomValue(config.simulation["aodb-planned-uncertainly"], true)
    arrguess.add(randomdelay, "seconds")
    backoffice.announce("flightboard", flight.flight, annoucets.toISOString(true), {
        info: "planned",
        move: "arrival",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        date: arrguess.format("DD/MM"),
        time: arrguess.format("HH:mm"),
        parking: flight.parking
    })

    var arrv = moment(tocsvret.syncevents["touchdown"])
    backoffice.announce("flightboard", flight.flight, tocsvret.syncevents["exitrunway"], {
        info: "actual",
        move: "arrival",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        date: arrv.format("DD/MM"),
        time: arrv.format("HH:mm"),
        parking: flight.parking
    })

    var arrpt = tocsvret.syncevents["park"] // last event
    var arrp = moment(arrpt, moment.ISO_8601)
    backoffice.announce("parking", flight.parking.toString(), arrp.toISOString(true), {
        info: "parking",
        move: "busy",
        flight: flight.flight,
        operator: flight.flight.substr(0,CODELEN),
        airport: flight.airport,
        parking: flight.parking
    })
}

function addRefuel(arrival, departure) {
    const serviceName = "fuel"
    const serviceData = airport.config.services[serviceName]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime = addDelay(atime, arrival)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    dtime = addDelay(dtime, departure)
    dtime.subtract(serviceData["beforeOffBlocks"], "m")

    var svc = {
        "service": serviceName,
        "parking": arrival.parking,
        "qty": serviceData.randomQuantity(),
        "datetime": atime.toISOString(),
        "datetime-max": dtime.toISOString(),
        "priority": 3
    }
    service.add(svc)
    debug.print(svc)
}


function addCatering(arrival, departure) {
    const serviceName = "catering"
    const serviceData = airport.config.services[serviceName]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime = addDelay(atime, arrival)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    dtime = addDelay(dtime, departure)
    dtime.subtract(serviceData["beforeOffBlocks"], "m")

    var svc = {
        "service": serviceName,
        "parking": arrival.parking,
        "qty": serviceData.randomQuantity(),
        "datetime": atime.toISOString(),
        "datetime-max": dtime.toISOString(),
        "priority": 3
    }
    service.add(svc)
    debug.print(svc)
}

function addSewage(arrival, departure) {
    const serviceName = "sewage"
    const serviceData = airport.config.services[serviceName]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime = addDelay(atime, arrival)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    dtime = addDelay(dtime, departure)
    dtime.subtract(serviceData["beforeOffBlocks"], "m")

    var svc = {
        "service": serviceName,
        "parking": arrival.parking,
        "qty": serviceData.randomQuantity(),
        "datetime": atime.toISOString(),
        "datetime-max": dtime.toISOString(),
        "priority": 3
    }
    service.add(svc)
    debug.print(svc)
}

function addFreit(arrival, departure) {
    const serviceName = "cargo"
    const serviceData = airport.config.services[serviceName]

    const p = serviceData["freit-quantity"] // params
    const qty = Math.floor(p[0] + Math.random() * Math.abs(p[1] - p[0]))

    const stime = serviceData["freit-service-time"]

    var atime = moment(arrival.isodatetime, moment.ISO_8601)
    atime = addDelay(atime, arrival)
    atime.add(serviceData["afterOnBlocks"], "m")

    var dtime = moment(departure.isodatetime, moment.ISO_8601)
    dtime = addDelay(dtime, departure)
    dtime.subtract(serviceData["beforeOffBlocks"], "m")



    for (var i = 0; i < qty; i++) {
        var svc = {
            "service": serviceName,
            "parking": arrival.parking,
            "qty": serviceData.randomQuantity(), // 1
            "datetime": atime.toISOString(),
            "datetime-max": dtime.toISOString(),
            "priority": 3
        }
        service.add(svc)
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
    if (arrival.flight.substr(0, 1) == "C" || arrival.flight.substr(0, 3) == "ASL") { // is a cargo flight
        addFreit(arrival, departure)
    } else {
        addSewage(arrival, departure)
        addCatering(arrival, departure)
    }

    debug.print("turnaround", moment.duration(duration).humanize())
}

//
function doServices() {
    var services = service.todo()
    if (program.debug)
        fs.writeFileSync(program.filePrefix + "services.json", JSON.stringify(services, null, 2), { mode: 0o644 })
    var trucks = service.doServices(services, airport, {
        park: true
    })
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            trucks[svc].forEach(function(truck, idx) {
                // get trip
                const fn = program.filePrefix + truck.getProp("service") + "-" + truck.getName().replace(/:/, "") // unix does not like :
                truck._features = truck.getFeatures()
                // add remarkable point (for sync)
                if (truck._points && truck._points.length > 0)
                    truck._features = truck._features.concat(truck._points)
                truck.geojson = geojson.FeatureCollection(truck._features)
                if (program.debug)
                    fs.writeFileSync(fn + "_.json", JSON.stringify(truck.geojson), { mode: 0o644 })

                // we emit it
                truck.events = emit.emitCollection(geojson.FeatureCollection(truck._features), {
                    speed: truck.getProp("speed"),
                    rate: truck.getProp("rate")
                    /*,
                                        jitter: 20*/
                })
                if (program.debug)
                    fs.writeFileSync(fn + ".json", JSON.stringify(truck.events), { mode: 0o644 })

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
function doFlightboard(flightboard) {
    // cleanup datetime
    flightboard.forEach(function(flight) {
        const day = flight.date == "" ? moment().format("YYYY-MM-DD") : flight.date
        flight.isodatetime = day + "T" + flight.time + ":00.000" + moment().format("Z") // flight time: 08:15, 22:55
        flight.zuludatetime = moment(flight.isodatetime, moment.ISO_8601).toISOString()
    })
    let sfb = flightboard.sort((a, b) => (moment(a.isodatetime, moment.ISO_8601).isAfter(moment(b.isodatetime, moment.ISO_8601))) ? 1 : -1)

    const wind = airportData.getWindDirection()
    debug.print("Wind direction", wind)
    if (airport.hasOwnProperty("METAR")) {
        backoffice.announce("metar", airport.METAR.station_id[0], moment(airport.METAR.raw_timestamp[0]).toISOString(true), { metar: airport.METAR.raw_text[0], time: airport.METAR.observation_time[0], airport: airport.METAR.station_id[0] })
    }

    if (sfb[0].move == "departure") {
        firstFlightDeparture = true
        console.log("doFlightboard: First flight is departure, don't forget to set --starting-situation flag if applicable.")
    }

    // 1. Generate flights
    sfb.forEach(function(flight) {
        var runway = airportData.randomRunway(wind)
        debug.print("using runway", runway)
        if (flight.move == "departure") {
            var arrvl = findArrivalForDeparture(sfb, flight)
            doDeparture(flight, runway, arrvl)
        } else { // arrival
            // generate arrival
            doArrival(flight, runway)
            // does it leave later?
            var departure = findDepartureForArrival(sfb, flight)
            if (departure) {
                // we pass info from previous flight
                departure.arrflightsched = flight.isodatetime
                departure.arrflightactual = flight.actualarrtime
                // we transport the delay of the arrival to the departure:
                if (flight.hasOwnProperty("delay")) {
                    if (flight.delay > 0) { // if arrival early, do not change schedule
                        departure.delay = flight.delay
                    }
                }
                doTurnaround(flight, departure)
            } // departure will be generated later
        }
    })
    // 2. Plan and generate services
    doServices()

    backoffice.save(program.filePrefix + "flightboard.csv")

    if (parkedAircraft != "")
        fs.writeFileSync(program.filePrefix + "parked.csv", parkedAircraft, { mode: 0o644 })
}

if (program.flightboard) {
    const csvstring = fs.readFileSync(program.flightboard, "utf8")
    const records = parse(csvstring, { columns: true })
    doFlightboard(records)
    /*records.forEach(function(s,idx) {
      debug.print(s)
    })*/
}