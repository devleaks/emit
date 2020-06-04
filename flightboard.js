const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug')

const geojson = require('./lib/geojson-util')
const random = require('./lib/random')

const simulator = require('./lib/movement-lib.js')
const service = require('./lib/service-lib.js')

const emit = require('./lib/emit-lib.js')
const tocsv = require('./lib/tocsv-lib.js')

const backoffice = require('./lib/backoffice.js')

const airportData = require('./lib/airport.js')
const aircraftData = require('./lib/aircraft')

debug.init(true, [""])

const config = require('./sim-config')

var airport = airportData.init(config)
var aircraft = aircraftData.init(config.aircrafts)

const FILEPREFIX = "FLIGHT-"

program
    .version('1.2.0')
    .description('generates flights from flight board (departure and arrival)')
    .option('-d, --debug', 'output extra debugging')
    .option('-p, --payload', 'Add payload column with all properties')
    .option('-s, --starting-situation', 'Flightboard has departure only, original situation must be set up', false)
    .requiredOption('-f, --flightboard <file>', 'CSV flightboard')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, ["doArrival", "doDeparture"])
debug.print(program.opts())


var situationSetupTime = false
var firstFlightDeparture = false

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
    console.log("arrival: Checking for", departure)
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
    console.log("arrival: Found", arrvl)
    return arrvl
}

function addDelay(t, f) {
    return (f.hasOwnProperty("delay") && f.delay > 0) ? moment(t).add(f.delay, "minutes") : t
}



/*  Generate full departure (write down CSV)
 */
function doDeparture(flight, runway, arrival) {
    const sid = airportData.randomSID(runway)
    flight.filename = FILEPREFIX + [flight.flight, flight.time].join("-").replace(/[:.+]/g, "-")

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
        announce = moment(flight.isodatetime, moment.ISO_8601).subtract(config.simulation["aodb-preannounce"], "seconds")
    }
    backoffice.announce("flightboard", flight.flight, announce.toISOString(true), {
        info: "scheduled",
        move: "departure",
        flight: flight.flight,
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
            airport: flight.airport,
            parking: flight.parking
        })
    }

    // fly it
    flight.geojson = simulator.takeoff(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, sid)
    if (program.debug)
        fs.writeFileSync(flight.filename + '_.json', JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })

    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30 })
    if (program.debug)
        fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    // add an actual ramdom delay to the flight
    var extradelay = random.randomValue(config.simulation["departure-delays"])
    // first if arrival was late, we postpone departure also (not if flight arrived early)
    flight.actualdeptime = moment(flight.isodatetime, moment.ISO_8601)
    if (flight.hasOwnProperty("delay")) {
        if (flight.delay > 0) {
            debug.print("Departure has delay because of late arrival", flight.delay, extradelay)
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
            airport: flight.airport,
            date: flight.actualdeptime.format("DD/MM"),
            time: flight.actualdeptime.format("HH:mm"),
            parking: flight.parking
        })
    }
    flight.actualdeptime.add(extradelay, "minutes") // add a little, unplanned, extra torture to departure

    const tocsvret = tocsv.tocsv(flight.events, moment(flight.actualdeptime), {
        queue: "aircraft",
        payload: program.payload
    })
    fs.writeFileSync(flight.filename + '.csv', tocsvret.csv, { mode: 0o644 })

    // departure is event 0. We add a little randomness around it, and a little randomness at the time it is annouceed 20-60 min in advance)
    var annoucets = moment(tocsvret.syncevents[0])
    annoucets.subtract(geojson.randomValue(config.simulation["aodb-planned-timeframe"]), "minutes")

    var dept = moment(tocsvret.syncevents[0])
    debug.print("departure", flight.flight, flight.isodatetime, flight.actualdeptime.toISOString(true), dept.toISOString(true))
    var deptguess = moment(tocsvret.syncevents[0])
    var randomdelay = geojson.randomValue(config.simulation["aodb-planned-uncertainly"], true)
    deptguess.add(randomdelay, "seconds")
    backoffice.announce("flightboard", flight.flight, annoucets.toISOString(true), {
        info: "planned",
        move: "departure",
        flight: flight.flight,
        airport: flight.airport,
        date: deptguess.format("DD/MM"),
        time: deptguess.format("HH:mm"),
        parking: flight.parking
    })

    backoffice.announce("flightboard", flight.flight, tocsvret.syncevents[0], {
        info: "actual",
        move: "departure",
        flight: flight.flight,
        airport: flight.airport,
        date: dept.format("DD/MM"),
        time: dept.format("HH:mm"),
        parking: flight.parking
    })

    backoffice.announce("parking", flight.parking.toString(), tocsvret.syncevents[0], {
        info: "parking",
        move: "available",
        flight: flight.flight,
        airport: flight.airport,
        parking: flight.parking
    })

    debug.print(flight.filename)
}

/*  Generate full arrival (write down CSV)
 */
function doArrival(flight, runway) {
    const star = airportData.randomSTAR(runway)
    flight.filename = FILEPREFIX + [flight.flight, flight.time].join("-").replace(/[:.+]/g, "-")

    var announce = moment(flight.isodatetime, moment.ISO_8601).subtract(config.simulation["aodb-preannounce"], "seconds")
    backoffice.announce("flightboard", flight.flight, announce.toISOString(true), {
        info: "scheduled",
        move: "arrival",
        flight: flight.flight,
        airport: flight.airport,
        date: moment(flight.isodatetime, moment.ISO_8601).format("YYYY-MM-DD"), //may be the day after announce time...
        time: flight.time,
        parking: flight.parking
    })

    // fly it
    flight.geojson = simulator.land(airport, flight.plane, aircraftData.randomAircraftModel(), flight.parking, runway, star)
    if (!flight.geojson)
        debug.print("parking:" + flight.parking, flight.plane, runway, star)
    if (program.debug)
        fs.writeFileSync(flight.filename + '_.json', JSON.stringify(geojson.FeatureCollection(flight.geojson.getFeatures(true))), { mode: 0o644 })

    flight.events = emit.emitCollection(geojson.FeatureCollection(flight.geojson.getFeatures(true)), { speed: 30, rate: 30, lastPoint: true })
    if (program.debug)
        fs.writeFileSync(flight.filename + '.json', JSON.stringify(flight.events), { mode: 0o644 })

    // add an actual ramdom delay to the flight
    flight.delay = random.randomValue(config.simulation["arrival-delays"])
    flight.actualarrtime = moment(flight.isodatetime, moment.ISO_8601)
    flight.actualarrtime.add(flight.delay, "minutes")

    const tocsvret = tocsv.tocsv(flight.events, moment(flight.actualarrtime), { // send a copy of time because it will vbe modified in tocsv
        queue: "aircraft",
        event: 3, // 1=STAR, 2=APPROACH, 3=Touch down, 4=Exit runwa, "last" = park on time
        payload: program.payload
    })
    fs.writeFileSync(flight.filename + '.csv', tocsvret.csv, { mode: 0o644 })


    // arrival's touch down is event 3. We add a little randomness around it, and a little randomness at the time it is annouceed
    var annoucets = moment(tocsvret.syncevents[0])
    annoucets.subtract(geojson.randomValue(config.simulation["aodb-planned-timeframe"]), "minutes")

    var arrv = moment(tocsvret.syncevents[3], moment.ISO_8601)
    var arrguess = moment(tocsvret.syncevents[3], moment.ISO_8601)
    var randomdelay = geojson.randomValue(config.simulation["aodb-planned-uncertainly"], true)
    arrguess.add(randomdelay, "seconds")
    backoffice.announce("flightboard", flight.flight, annoucets.toISOString(true), {
        info: "planned",
        move: "arrival",
        flight: flight.flight,
        airport: flight.airport,
        date: arrguess.format('DD/MM'),
        time: arrguess.format('HH:mm'),
        parking: flight.parking
    })

    var arrv = moment(tocsvret.syncevents[3])
    debug.print("arrival", flight.flight, flight.isodatetime, flight.delay, flight.actualarrtime.toISOString(true), arrv.toISOString(true))
    backoffice.announce("flightboard", flight.flight, tocsvret.syncevents[4], {
        info: "actual",
        move: "arrival",
        flight: flight.flight,
        airport: flight.airport,
        date: arrv.format('DD/MM'),
        time: arrv.format('HH:mm'),
        parking: flight.parking
    })

    var arrpt = tocsvret.syncevents[Object.keys(tocsvret.syncevents).length - 1] // last event
    var arrp = moment(arrpt, moment.ISO_8601)
    backoffice.announce("parking", flight.parking.toString(), arrp.toISOString(true), {
        info: "parking",
        move: "busy",
        flight: flight.flight,
        airport: flight.airport,
        parking: flight.parking
    })

    debug.print(flight.filename)
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
        fs.writeFileSync(FILEPREFIX + 'services.json', JSON.stringify(services, null, 2), { mode: 0o644 })
    var trucks = service.doServices(services, airport, {
        park: true
    })
    for (var svc in trucks) {
        if (trucks.hasOwnProperty(svc)) {
            trucks[svc].forEach(function(truck, idx) {
                // get trip
                const fn = FILEPREFIX + truck.getProp("service") + '-' + truck.getName().replace(/:/, "") // unix does not like :
                truck._features = truck.getFeatures()
                // add remarkable point (for sync)
                if (truck._points && truck._points.length > 0)
                    truck._features = truck._features.concat(truck._points)
                truck.geojson = geojson.FeatureCollection(truck._features)
                if (program.debug)
                    fs.writeFileSync(fn + '_.json', JSON.stringify(truck.geojson), { mode: 0o644 })

                // we emit it
                truck.events = emit.emitCollection(geojson.FeatureCollection(truck._features), {
                    speed: truck.getProp("speed"),
                    rate: truck.getProp("rate"),
                    jitter: 20
                })
                if (program.debug)
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
    sfb = flightboard.sort((a, b) => (moment(a.isodatetime, moment.ISO_8601).isAfter(moment(b.isodatetime, moment.ISO_8601))) ? 1 : -1)

    backoffice.announce("metar", "eblg", moment(airport.METAR.raw_timestamp[0]).toISOString(true), { metar: airport.METAR.raw_text[0], time: airport.METAR.observation_time[0] })

    if (sfb[0].move == "departure") {
        firstFlightDeparture = true
        console.log("doFlightboard: First flight is departure, don't forget to set --starting-situation flag if applicable.")
    }

    // 1. Generate flights
    sfb.forEach(function(flight, idx) {
        var runway = airportData.randomRunway(270)
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
                    if (flight.delay > 0) {
                        departure.delay = flight.delay
                    }
                }
                doTurnaround(flight, departure)
            } // departure will be generated later
        }
    })
    // now plan and generate services
    doServices()

    backoffice.save(FILEPREFIX + 'flightboard.csv')
}

if (program.flightboard) {
    const csvstring = fs.readFileSync(program.flightboard, 'utf8')
    const records = parse(csvstring, { columns: true })
    doFlightboard(records)
    /*records.forEach(function(s,idx) {
      debug.print(s)
    })*/
}