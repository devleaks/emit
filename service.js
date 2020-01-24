const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')

var program = require('commander')

const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')

const config = require('./sim-config')
const geojson = require('./geojson-util')
const common = require('./common')
const debug = require('./debug.js')



program
    .version('2.0.0')
    .description('generates GeoJSON features for aircraft service. Creates a single truck for each service')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, ["", "xxselectTruck"], "main")

debug.print(program.opts())


var airport = {}

var jsonfile = fs.readFileSync(config.airport.parkings, 'utf8')
airport.parkings = JSON.parse(jsonfile)
airport.parkings._network_name = "parking"

jsonfile = fs.readFileSync(config.airport.service, 'utf8')
airport.serviceroads = JSON.parse(jsonfile)
airport.serviceroads._network_name = "serviceroads"

jsonfile = fs.readFileSync(config.airport.pois, 'utf8')
airport.pois = JSON.parse(jsonfile)
airport.pois._network_name = "pois"


airport.serviceroads.features.forEach(function(f) {
    if (f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01) // 1=1 km. 0.01 = 10m (minimum)
})
//fs.writeFileSync('segmented.json', JSON.stringify(airport.serviceroads), { mode: 0o644 })

/* Find closest point to network of roads (FeatureCollectionof LineStrings)
 * Returns Point
 */
function findClosest(p, network) {
    if (typeof(p.nearestPointOnLine) == "undefined" || typeof(p.nearestPointOnLine[network._network_name]) == "undefined") {
        p.nearestPointOnLine = p.nearestPointOnLine ? p.nearestPointOnLine : {}
        if (typeof(network.mls) == "undefined") { // build suitable structure for nearestPointOnLine, cache it.
            network.mls = geojson.multilinestring(network)
        }
        p.nearestPointOnLine[network._network_name] = turf.nearestPointOnLine(network.mls, p)
    }
    return p.nearestPointOnLine[network._network_name]
}


/* Find route from p_from to p_to on network of roads.
 * Returns LineString or roads or direct path between the two points if no road found.
 */
function route(p_from, p_to, network) {
    // fs.writeFileSync('debug.json', JSON.stringify({"type":"FeatureCollection", "features": [p_from, p_to]}), { mode: 0o644 })
    const pathfinder = new PathFinder(network, {
        precision: 0.0005
    });

    const path = pathfinder.findPath(p_from, p_to);

    if (!path)
        debug.print("could not find route", p_from, p_to)

    return geojson.LineString(path ? path.path : [p_from, p_to])
}




/* =========================================================
 * Service functional function
 */
/* Refill: Move truck from its position to refueling station (fuel)
 * Augment truck trip line string.
 * Return nothing.
 */
function selectRefillStation(truck) {
    return config.services[truck.getProp("service")]["base"][0] // take first one for now
}

function refill(truck) {
    // get to service_road
    var p = findClosest(truck.getProp("position"), airport.serviceroads)
    truck.addPointToTrack(p, truck.getProp("slow"), 30) // move truck from where it is to service road

    var refillStationName = selectRefillStation(truck)
    var refillStation = geojson.findFeature(refillStationName, airport.pois, "name")
    // get closest point to fuel on serviceroad
    var p1 = findClosest(refillStation, airport.serviceroads)
    //debug.print("closest to refillStation", refillStation, p1)

    // get to refill area on service roads
    var r = route(p, p1, airport.serviceroads)

    truck.addPathToTrack(r.coordinates, truck.getProp("speed"), null)

    // ADD STOP TO EXPLAIN REFILL 
    truck.addMarker(refillStation, 0, truck.refillTime(truck.getProp("capacity") - truck.getProp("load")), "refill " + (truck.getProp("capacity") - truck.getProp("load")))

    truck.addPointToTrack(refillStation, 0, truck.refillTime(truck.getProp("capacity") - truck.getProp("load"))) // move truck from serviceroad to refill station + refill
    truck.setProp("position", refillStation.geometry.coordinates) // at refill station
    truck.setProp("load", truck.getProp("capacity")) // refilled
}


/* Serve: Move truck from its position to parking position of aircraft to service. Add time spent at aircraft to perform service.
 * Augment truck trip line string.
 * Return nothing.
 */
function serve(service, truck) {
    truck.setProp("status", "busy")
    // get from truck position to service road, move there slowly
    var p = findClosest(truck.getProp("position"), airport.serviceroads)
    //debug.print("closest to truck", truck.position, p)
    truck.addPointToTrack(p, truck.getProp("slow"), 30) // truck moves to serviceroad

    // get to parking on service road at full speed
    var parking = geojson.findFeature(service.parking, airport.parkings, "ref")
    debug.print(parking)
    if (!parking) {
        debug.print("not found", "ref", service.parking)
        return
    }
    var p1 = findClosest(parking, airport.serviceroads)
    //debug.print("closest to parking", parking, p1)

    // move truck from where it was to close to parking on serviceroads
    var r = route(p, p1, airport.serviceroads)
    truck.addPathToTrack(r.coordinates, truck.getProp("speed"), null)

    // get from service road to parking slowly and service plane
    // service
    truck.addPointToTrack(parking, truck.getProp("slow"), truck.serviceTime(service.qty))
    truck.setProp("load", truck.getProp("load") - service.qty)
    truck.setProp("position", parking.geometry.coordinates)
    // ADD STOP TO EXPLAIN SERVICE OPERATION
    truck.addMarker(parking, 0, truck.refillTime(truck.getProp("capacity") - truck.getProp("load")), "serving " + parking.properties.ref + " " + service.qty)
    truck.setProp("status", "available")
}

/* Hook to place your fuel truck delivery optimization function. Called after each service.
 * The first array element will be poped out of the returning array.
 */
function optimize(trucks, services) {
    return services
}

function selectTruck(trucks, service) {
    if (trucks.hasOwnProperty(service.service))
        return trucks[service.service]

    const truck_type = config.services[service.service]["trucks"][0] // take first one for now

    var device = new common.Device(truck_type.name, truck_type)
    device.setProp("service", service.service)

    if (typeof(device.serviceTime) == "undefined")
        device.serviceTime = config.services[service.service].serviceTime
    if (typeof(device.refillTime) == "undefined")
        device.refillTime = config.services[service.service].refillTime

    var rsn = selectRefillStation(device) // no check
    var rs = geojson.findFeature(rsn, airport.pois, "name") // no check

    device.setProp("position", rs.geometry.coordinates)
    device.setProp("load", truck_type.capacity)

    trucks[service.service] = device
    debug.print('added', device)
    return device
}


/*
 * R E F U E L
 */
function do_services(services) {
    var service = null
    var trucks = []

    while (service = services.pop()) {
        debug.print("doing..", service)
        var truck = selectTruck(trucks, service)

        if (service.qty > truck.getProp("load")) {
            refill(truck)
        }
        serve(service, truck)

        services = optimize(trucks, services)
        debug.print("..done")
    }
    return trucks
}


var services = []
const plist = ["H10",
    "H8",
    52,
    "L17",
    "K13",
    "29B",
    55,
    20,
    63,
    "43B",
    128,
    27,
    59
]

plist.forEach(function(n) {
    if (Math.random() > 0)
        services.push({ "service": "fuel", "parking": n, "qty": (4000 + Math.floor(Math.random()*10) * 100), "datetime": null, "priority": 3 })
    else
        services.push({ "service": "catering", "parking": n, "qty": Math.floor(Math.random()*2), "datetime": null, "priority": 3 })
})

var trucks = do_services(services)

var features = []
for (var service in trucks) {
    if (trucks.hasOwnProperty(service)) {
        const truck = trucks[service]
        var f = truck.getFeatures()
        features = features.concat(f)
    }
}

fs.writeFileSync(program.O, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.O + ' written')