const fs = require('fs')
const turf = require('@turf/turf')
const parse = require('csv-parse/lib/sync')

const config = require('../sim-config')
const geojson = require('../lib/geojson-util')
const vehicle = require('../lib/device')
const debug = require('../lib/debug')


exports.readAirport = function(config, dirbase = './') {
    var airport = {}

    airport.config = config

    var jsonfile = fs.readFileSync(dirbase + config.airport.parkings, 'utf8')
    airport.parkings = JSON.parse(jsonfile)
    airport.parkings._network_name = "parking"

    jsonfile = fs.readFileSync(dirbase + config.airport.pois, 'utf8')
    airport.pois = JSON.parse(jsonfile)
    airport.pois._network_name = "pois"

    jsonfile = fs.readFileSync(dirbase + config.airport.service, 'utf8')
    airport.serviceroads = JSON.parse(jsonfile)
    airport.serviceroads._network_name = "serviceroads"

    geojson.complexify(airport.serviceroads)

    return airport
}


/* =========================================================
 * Service functional function
 */
/* Refill: Move truck from its position to refueling station (fuel)
 * Augment truck trip line string.
 * Return nothing.
 */
function selectRefillStation(truck, airport) {
    return airport.config.services[truck.getProp("service")]["base"][0] // take first one for now
}

function refill(truck, airport, syncCount) {
    // get to service_road
    var p = geojson.findClosest(truck.getProp("position"), airport.serviceroads)
    truck.addPointToTrack(p, truck.getProp("slow"), 30) // move truck from where it is to service road

    var refillStationName = selectRefillStation(truck, airport)
    var refillStation = geojson.findFeature(refillStationName, airport.pois, "name")
    // get closest point to fuel on serviceroad
    var p1 = geojson.findClosest(refillStation, airport.serviceroads)
    //debug.print("closest to refillStation", refillStation, p1)

    // get to refill area on service roads
    var r = geojson.route(p, p1, airport.serviceroads)

    truck.addPathToTrack(r.coordinates, truck.getProp("speed"), null)

     // ADD STOP TO EXPLAIN REFILL 
    truck.addPointToTrack(refillStation, 0, truck.refillTime(truck.getProp("capacity") - truck.getProp("load"))) // move truck from serviceroad to refill station + refill

    truck.addMarker(
        refillStation,
        0,
        truck.refillTime(truck.getProp("capacity") - truck.getProp("load")),
        syncCount,
        truck.getProp("color"), {
            "device": truck.getProp("name"),
            "capacity": truck.getProp("capacity"),
            "load": truck.getProp("load"),
            "status": truck.getProp("status"),
            "comment": "refill " + (truck.getProp("capacity") - truck.getProp("load")) + " at " + refillStationName
        })

    truck.setProp("position", refillStation.geometry.coordinates) // at refill station
    truck.setProp("load", truck.getProp("capacity")) // refilled
}


/* Serve: Move truck from its position to parking position of aircraft to service. Add time spent at aircraft to perform service.
 * Augment truck trip line string.
 * Return nothing.
 */
function serve(service, truck, airport, syncCount) {
    truck.setProp("status", "busy")
    // get from truck position to service road, move there slowly
    var p = geojson.findClosest(truck.getProp("position"), airport.serviceroads)
    //debug.print("closest to truck", truck.position, p)
    truck.addPointToTrack(p, truck.getProp("slow"), 30) // truck moves to serviceroad

    // get to parking on service road at full speed
    var parking = geojson.findFeature(service.parking, airport.parkings, "name")
    debug.print(parking)
    if (!parking) {
        debug.print("not found", "name", service.parking)
        return
    }
    var p1 = geojson.findClosest(parking, airport.serviceroads)
    //debug.print("closest to parking", parking, p1)

    // move truck from where it was to close to parking on serviceroads
    var r = geojson.route(p, p1, airport.serviceroads)
    truck.addPathToTrack(r.coordinates, truck.getProp("speed"), null)

    // get from service road to parking slowly and service plane
    // service
    truck.addPointToTrack(parking, truck.getProp("slow"), truck.serviceTime(service.qty))

    truck.setProp("load", truck.getProp("load") - service.qty)
    truck.setProp("position", parking.geometry.coordinates)

    // ADD STOP TO EXPLAIN SERVICE OPERATION
    truck.addMarker(
        parking,
        0,
        truck.serviceTime(service.qty),
        syncCount,
        truck.getProp("color"), {
            "device": truck.getProp("name"),
            "capacity": truck.getProp("capacity"),
            "load": truck.getProp("load"),
            "status": truck.getProp("status"),
            "comment": "serve " + (truck.getProp("capacity") - truck.getProp("load"))+ " at " + service.parking
        })

    truck.setProp("status", "available")
}

/* Hook to place your fuel truck delivery optimization function. Called after each service.
 * The first array element will be poped out of the returning array.
 */
function optimize(trucks, services, airport) {
    return services
}

function selectTruck(trucks, service, airport, options) {
    if (trucks.hasOwnProperty(service.service))
        return trucks[service.service]

    const truck_type = airport.config.services[service.service]["trucks"][0] // take first one for now

    var device = new vehicle.Device(truck_type.name, truck_type)
    device.setProp("service", service.service)

    if (!device.hasOwnProperty("serviceTime"))
        device.serviceTime = airport.config.services[service.service].serviceTime
    if (!device.hasOwnProperty("refillTime"))
        device.refillTime = airport.config.services[service.service].refillTime

    var rsn
    var db = 'pois'
    if (options.start) {
        const startplace = options.start.split(":")
        db = startplace[0]
        rsn = startplace[1]
        if (!airport.hasOwnProperty(db)) {
            debug.error("cannot find position database '" + db + "'")
            return false
        }
    } else {
        rsn = selectRefillStation(device, airport) // no check
    }
    debug.print(rsn, db)
    var rs = geojson.findFeature(rsn, airport[db], "name") // no check
    if (!rs) {
        debug.error("cannot find position '" + rsn + "' in database '" + db + "'")
        return false
    }

    device.setProp("position", rs.geometry.coordinates)
    device.setProp("load", truck_type.capacity)

    trucks[service.service] = device
    debug.print('added', device)
    return device
}


/*
 * R E F U E L
 */
exports.doServices = function(services, airport, options) {
    var service = null
    var trucks = []
    var syncCount = 0

    while (service = services.pop()) {
        var truck = selectTruck(trucks, service, airport, options)

        if (!truck)
            return false

        if (service.qty > truck.getProp("load")) {
            refill(truck, airport, syncCount)
            syncCount++
        }
        serve(service, truck, airport, syncCount)
        syncCount++

        services = optimize(trucks, services, airport) // services only contains those left to be serviced
    }
    if (options.park) {
        console.log("parking")
        for (var service in trucks) {
            if (trucks.hasOwnProperty(service)) {
                refill(trucks[service])
                debug.print('refilled', trucks[service]._name)
            }
        }
    }
    return trucks
}