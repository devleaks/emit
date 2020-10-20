import turf from "@turf/turf";
import moment from "moment";
import * as geojson from "./geojson-util.js";
import * as vehicle from "./device.js";
import * as debug from "./debug.js";
import { jitter } from "./emit-lib.js";

let _SERVICES = []

/* =========================================================
 * Service functional function
 */
/* Refill: Move truck from its position to refueling station (fuel)
 * Augment truck trip line string.
 * Return nothing.
 */
function selectRefillStation(service, truck, airport) {
    // getClosestRefillStation(..)
    if (service.service == "cargo") {
        let apron = truck.getProp("apron")
        if (typeof apron == "undefined") {
            if (service.hasOwnProperty("parking")) {
                let parking = geojson.findFeature(service.parking, airport.parkings, "name")
                debug.print(parking)
                if (!parking) {
                    debug.error("not found", "name", service.parking)
                    return
                }
                truck.setProp("apron", parking.properties.apron)
            }
        }
        return "CARGO" + truck.getProp("apron")
    }

    return geojson.randomElemFrom(airport.config.services[truck.getProp("service")]["base"])
}

function refill(service, truck, airport) {
    // get to service_road
    let p = geojson.findClosest(truck.getProp("position"), airport.serviceroads)
    truck.addPointToTrack(p, truck.getProp("slow"), 30) // move truck from where it is to service road

    let refillStationName = selectRefillStation(service, truck, airport)
    let refillStation = geojson.findFeature(refillStationName, airport.pois, "name")
    // get closest point to fuel on serviceroad
    let p1 = geojson.findClosest(refillStation, airport.serviceroads)
    //debug.print("closest to refillStation", refillStation, p1)

    // get to refill area on service roads
    let r = geojson.route(p, p1, airport.serviceroads)

    truck.addPathToTrack(r.coordinates, truck.getProp("speed"), null)

    // ADD STOP TO EXPLAIN REFILL 
    truck.addPointToTrack(refillStation, 0, truck.refillTime(truck.getProp("capacity") - truck.getProp("load"))) // move truck from serviceroad to refill station + refill

    truck.addMarker(
        "refill",
        refillStation,
        0,
        truck.refillTime(truck.getProp("capacity") - truck.getProp("load")),
        null,
        truck.getProp("color"),
        {
            "device": truck.getName(),
            "capacity": truck.getProp("capacity"),
            "load": truck.getProp("load"),
            "status": truck.getProp("status"),
            "action": "refill",
            "quantity": truck.getProp("capacity") - truck.getProp("load"),
            "posname": refillStationName
        })

    truck.setProp("position", refillStation.geometry.coordinates) // at refill station
    truck.setProp("load", truck.getProp("capacity")) // refilled
}


/* Serve: Move truck from its position to parking position of aircraft to service. Add time spent at aircraft to perform service.
 * Augment truck trip line string.
 * Return nothing.
 */
function serve(service, truck, airport) {
    truck.setProp("status", "busy")
    truck.setProp("current-service", service)
    // get from truck position to service road, move there slowly
    let p = geojson.findClosest(truck.getProp("position"), airport.serviceroads)
    //debug.print("closest to truck", truck.position, p)
    truck.addPointToTrack(p, truck.getProp("slow"), 30) // truck moves to serviceroad

    // get to parking on service road at full speed
    let parking = geojson.findFeature(service.parking, airport.parkings, "name")
    debug.print(parking)
    if (!parking) {
        debug.print("not found", "name", service.parking)
        return
    }
    let p1 = geojson.findClosest(parking, airport.serviceroads)
    //debug.print("closest to parking", parking, p1)

    // move truck from where it was to close to parking on serviceroads
    let r = geojson.route(p, p1, airport.serviceroads)
    truck.addPathToTrack(r.coordinates, truck.getProp("speed"), null)

    // we do not stop "exactly" at the parking's center but nearby
    let aroundParkingCoordinates = jitter(parking.geometry.coordinates, 30) // 30 meters

    // get from service road to parking slowly and service plane
    // service
    truck.addPointToTrack(aroundParkingCoordinates, truck.getProp("slow"), truck.serviceTime(service.qty))

    truck.setProp("load", truck.getProp("load") - service.qty)
    truck.setProp("position", aroundParkingCoordinates)

    // ADD STOP TO EXPLAIN SERVICE OPERATION
    truck.addMarker(
        "serve",
        aroundParkingCoordinates,
        0,
        truck.serviceTime(service.qty),
        truck.getProp("syncCount"),
        truck.getProp("color"),
        {
            "device": truck.getName(),
            "service": truck.getProp("service"),
            "capacity": truck.getProp("capacity"),
            "load": truck.getProp("load"),
            "status": truck.getProp("status"),
            "action": "serve",
            "quantity": service.qty,
            "posname": service.parking,
            "scheduled": service.datetime
        })
    truck.setProp("syncCount", truck.getProp("syncCount") + 1)

    truck.setProp("last-service", service)
    truck.setProp("last-parking", service.parking)
    truck.setProp("status", "available")

    // We add an extra point at the end to move the truck away from parking back to service road
    // so that it 'leaves' the parking position after it services.
    truck.addPointToTrack(p1, truck.getProp("slow"), 0)
    truck.setProp("position", p1.geometry.coordinates)
    truck.addPointToTrack(p1, 0, 120) // make sure it emits out of parking space.
}

/* Hook to place your fuel truck delivery optimization function. Called after each service.
 * The first array element will be poped out of the returning array.
 */
function optimize(trucks, services, airport) {
    return services
}

function addISOdate(datefrom, qty, what) {
    let d = moment(datefrom)
    d.add(qty, what)
    return d.toISOString()
}

/*  Estimate time to travel from src to dst on network, src and dst format: dbname:pointname (parkings:P51, pois:FUEL1)
 */
// returns a line string from src to dst on network.
function trip(src, dst, network) {
    let ls = []
    ls.push(src.geometry.coordinates)
    const ps = geojson.findClosest(src, network)
    const pe = geojson.findClosest(dst, network)
    let trip = geojson.route(ps, pe, airport.serviceroads)
    trip.coordinates.forEach(function(p, idx) {
        ls.push(p)
    })
    ls.push(dst.geometry.coordinates)
    return geojson.Feature(geojson.LineString(ls))
}

// returns time to travel from src to dst on network at constant speed.
function timeToTravel(src, dst, speed, network, airport) {
    const startplace = src.split(":")
    let db = startplace[0]
    let rsn = startplace[1]
    if (!airport.hasOwnProperty(db)) {
        debug.error("cannot find position database '" + db + "'")
        return false
    }
    let rs = geojson.findFeature(rsn, airport[db], "name") // no check
    if (!rs) {
        debug.error("cannot find position '" + rsn + "' in database '" + db + "'")
        return false
    }

    const endplace = src.split(":")
    db = endplace[0]
    rsn = endplace[1]
    if (!airport.hasOwnProperty(db)) {
        debug.error("cannot find position database '" + db + "'")
        return false
    }
    let re = geojson.findFeature(rsn, airport[db], "name") // no check
    if (!rs) {
        debug.error("cannot find position '" + rsn + "' in database '" + db + "'")
        return false
    }
    const ls = trip(rs, re, airport[network])
    const len = turf.length(ls, { units: "kilometers" })
    return 3600 * len / speed
}

/*  Select a truck to perform service. If no truck is capapble of serving on time, instanciate a new truck.
 *  (we will someday correct this...)
 *  Returns a device where service track can be stored.
 */
function selectTruckForService(trucks, service, airport, options) {
    const TRIP_TO_REFILL = 10 * 60 // 10 minutes in seconds
    if (trucks.length > 0) { // we have at least one truck, can we reuse it?
        let availTruck = null
        let idx = 0
        let availFrom, neededAt
        while (!availTruck && idx < trucks.length) {
            let loctruck = trucks[idx]
            availFrom = moment(loctruck.getProp("busyTo"))
            // can the truck deliver the qty?
            if (service.qty > loctruck.getProp("load")) { // if not, add an average trip to refill
                const time_to_refill = 2 * TRIP_TO_REFILL + loctruck.refillTime(loctruck.getProp("capacity") - loctruck.getProp("load"))
                availFrom.add(time_to_refill, "seconds")
                debug.print(loctruck.getName(), "need refill", moment.duration(time_to_refill, 'seconds').humanize())
            }
            neededAt = moment(service.datetime)
            if (availFrom.isBefore(neededAt)) {
                availTruck = trucks[idx]
            }
            idx++
        }
        if (availTruck) { // prepare/reserve it for service
            debug.print("found truck", idx - 1 + '/' + trucks.length, availFrom.toISOString(), neededAt.toISOString())
            availTruck.setProp("busyTo", service.endtime)
            return availTruck
        }
    } // no truck found to serve on time, create a new one...
    debug.print("no truck found", trucks.length, service.endtime)

    // create a new truck and add it to the list (infinity)
    const serviceData = airport.config.services[service.service]
    const serviceTrucks = serviceData["trucks"]

    // clone first one to start with
    const truck = geojson.cleanCopy(serviceTrucks[0])

    let device = new vehicle.Device(service.service + ":" + trucks.length, truck)
    device.setProp("service", service.service)

    if (!device.hasOwnProperty("serviceTime"))
        device.serviceTime = serviceData.serviceTime
    if (!device.hasOwnProperty("refillTime"))
        device.refillTime = serviceData.refillTime
    if (!device.hasOwnProperty("rate"))
        device.setProp("rate", serviceData.rate ? serviceData.rate : 60)
    if (!device.hasOwnProperty("speed"))
        device.setProp("speed", serviceData.speed ? serviceData.speed : 30)

    // they all start full
    device.setProp("load", truck.capacity)
    device.setProp("syncCount", 0)

    // place new device at its refill station (they all start from there.)
    let rsn
    let db = 'pois'
    if (options.start) {
        const startplace = options.start.split(":")
        db = startplace[0]
        rsn = startplace[1]
        if (!airport.hasOwnProperty(db)) {
            debug.error("cannot find position database '" + db + "'")
            return false
        }
    } else {
        rsn = selectRefillStation(service, device, airport) // no check
    }
    debug.print(rsn, db)
    let rs = geojson.findFeature(rsn, airport[db], "name") // no check
    if (!rs) {
        debug.error("cannot find position '" + rsn + "' in database '" + db + "'")
        return false
    }
    device.setProp("position", rs.geometry.coordinates)
    device.setProp("busyTo", service.endtime)

    trucks.push(device)

    debug.print('new', trucks.length, service.endtime, device.getName())
    return device
}


/*  For one service type, instanciate an infinity of truck to satisfy demand.
 */
function doServicesForType(services, airport, options) {
    let svcThisType = services.sort((a, b) => (a.datetime > b.datetime) ? 1 : -1)
    let trucks = []
    let service

    while (service = svcThisType.shift()) {
        let truck = selectTruckForService(trucks, service, airport, options)
        if (service.qty > truck.getProp("load") || truck.getProp("service") == "cargo") {
            refill(service, truck, airport)
        }
        serve(service, truck, airport)
        // svcThisType = optimize(trucks, svcThisType, airport) // services only contains those left to be serviced
    }

    if (options.park) {
        debug.print("parking trucks..")
        trucks.forEach(function(truck, idx) {
            refill({ service: truck.getProp("service") }, truck, airport)
        })
        debug.print("..done")
    }

    return trucks
}

/*  We estimate how long each service will take
 *  We provide default for datetime and datetime-max.
 *  Service should occur between service.datetime and service.endtime
 */
function prepareAllServices(services, airport, options) {
    let servicesByType = {}

    services.forEach(function(service, idx) {
        servicesByType[service.service] = servicesByType.hasOwnProperty(service.service) ? servicesByType[service.service] : []
        const svcTime = airport.config.services[service.service].serviceTime
        service.duration = svcTime(service.qty)
        if (!service.datetime)
            service.datetime = moment().toISOString()

        let endtime = moment(service.datetime)
        endtime.add(service.duration, "seconds")
        service.endtime = endtime.toISOString()

        debug.print(service.service, service.datetime, service.duration, service.endtime)

        if (!service["datetime-max"])
            service["datetime-max"] = service.endtime

        servicesByType[service.service].push(service)
    })

    return servicesByType
}


/*
 * SERVE ALL SERVICES
 */
export const doServices = function(services, airport, options) {
    let servicesByType = prepareAllServices(services, airport, options)

    let trucks = {}
    for (let serviceType in servicesByType) {
        if (servicesByType.hasOwnProperty(serviceType)) {
            trucks[serviceType] = doServicesForType(servicesByType[serviceType], airport, options)
        }
    }
    return trucks
};

export const add = function(service) {
    _SERVICES.push(service)
};

export const todo = function() {
    return _SERVICES
};


