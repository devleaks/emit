const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')
const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')
const config = require('./sim-config')

const geojson = require('./geojson-util')

var program = require('commander')


const NAUTICAL_MILE = 1852 // nautical mile

program
    .version('1.2.0')
    .description('generates GeoJSON features for aircraft refueling')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

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

const debug = require('./debug.js')

debug.init(true, [""], "main")

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
 * Build truck line string
 */
/* add_point: Add Point to linestring feature. Point can be either an array of coordinate, or a geojson geometry or feature
 * Return nothing.
 */
function add_point(truck, point, speed, wait) { // point = [lon, lat]
    debug.print(point, point.geometry, geojson.coords(point))
    truck.trip.push(geojson.coords(point))
    var c = truck.trip.length - 1
    if (speed)
        truck.speeds.push({ "idx": c, "speed": speed })
    if (wait)
        truck.waits.push({ "idx": c, "pause": wait })
}


/* add_linestring: Append linestring to linestring feature.
 * Return nothing.
 */
function add_linestring(truck, trip, speed, wait) {
    debug.print("adding..")
    trip.forEach(function(p, idx) {
        add_point(truck, p, speed, wait)
    })
    debug.print("..added")
}


/* add_stop: Add a remarkable Point feature for later use or display.
 * Return nothing.
 */
function add_stop(truck, point, speed, wait, note) { // point = [lon, lat]
    if (geojson.isFeature(point)) {
        point.properties = point.properties ? point.properties : {}
        point.properties["speed"] = speed
        point.properties["wait"] = wait
        point.properties["note"] = note
        point.properties["marker-color"] = "#aa0000"
        point.properties["marker-size"] = "medium"
        point.properties["marker-symbol"] = ""
        truck.stops.push(point)
    } else {
        truck.stops.push(geojson.Feature(point, {
            "speed": speed,
            "wait": wait,
            "note": note,
            "marker-color": "#aa0000",
            "marker-size": "medium",
            "marker-symbol": ""
        }))
    }
}
/* =========================================================
 * Service functional function
 */
/* Refill: Move truck from its position to refueling station (fuel)
 * Augment truck trip line string.
 * Return nothing.
 */
function selectRefillStation(truck) {
    return config.services[truck.service]["base"][0] // take first one for now
}

function refill(truck) {
    // get to service_road
    var p = findClosest(truck.position, airport.serviceroads)
    add_point(truck, p, truck.slow, 30) // move truck from where it is to service road

    var refillStationName = selectRefillStation(truck)
    var refillStation = geojson.findFeature(refillStationName, airport.pois, "name")
    // get closest point to fuel on serviceroad
    var p1 = findClosest(refillStation, airport.serviceroads)
    //debug.print("closest to refillStation", refillStation, p1)

    // get to refill area on service roads
    var r = route(p, p1, airport.serviceroads)

    add_linestring(truck, r.coordinates, truck.speed, null)

    // ADD STOP TO EXPLAIN REFILL 
    add_stop(truck, refillStation, 0, truck.refillTime(truck.capacity - truck.load), "refill "+ (truck.capacity - truck.load))

    add_point(truck, refillStation, 0, truck.refillTime(truck.capacity - truck.load)) // move truck from serviceroad to refill station + refill
    truck.position = refillStation.geometry.coordinates // at refill station
    truck.load = truck.capacity // refilled
}


/* Serve: Move truck from its position to parking position of aircraft to service. Add time spent at aircraft to perform service.
 * Augment truck trip line string.
 * Return nothing.
 */
function serve(service, truck) {
    // get from truck position to service road, move there slowly
    var p = findClosest(truck.position, airport.serviceroads)
    //debug.print("closest to truck", truck.position, p)
    add_point(truck, p, truck.slow, 30) // truck moves to serviceroad

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
    if (r)
        add_linestring(truck, r.coordinates, truck.speed, null)
    else
        debug.print("route not found", p, p1)

    // get from service road to parking slowly and service plane
    // service
    add_point(truck, parking, truck.slow, truck.serviceTime(service.qty))
    truck.load -= service.qty
    truck.position = parking.geometry.coordinates
    // ADD STOP TO EXPLAIN SERVICE OPERATION
    add_stop(truck, parking, 0, truck.refillTime(truck.capacity - truck.load), "serving "+parking.properties.ref+" "+service.qty)
}

/* Hook to place your fuel truck delivery optimization function. Called after each service.
 * The first array element will be poped out of the returning array.
 */
function optimize(trucks, services) {
    return services
}

function selectTruck(trucks, service) {
    var truck = config.services[service.service]["trucks"][0] // take first one for now
    if (typeof(truck.position) == "undefined") { // means truck has not been used yet
        truck.service = service.service
        if(typeof(truck.serviceTime) == "undefined")
            truck.serviceTime = config.services[service.service].serviceTime
        if(typeof(truck.refillTime) == "undefined")
            truck.refillTime = config.services[service.service].refillTime
        var rsn = selectRefillStation(truck)
        var rs = geojson.findFeature(rsn, airport.pois, "name")
        truck.position = rs.geometry.coordinates
        truck.load = truck.capacity
        truck.trip = []
        truck.stops = []
        truck.speeds = []
        truck.waits = []
        trucks.push(truck)  // add truck
        debug.print('added',truck)
    }
    return truck
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
        truck.status = "busy"

        if (service.qty > truck.load) {
            refill(truck)
        }
        serve(service, truck)

        services = optimize(trucks, services)
        truck.status = "available"
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
    if(Math.random() > 0)
        services.push({ "service": "fuel", "parking": n, "qty": 12000, "datetime": null, "priority": 3 })
    else
        services.push({ "service": "catering", "parking": n, "qty": 1, "datetime": null, "priority": 3 })
})

var trucks = do_services(services)

var features = []
trucks.forEach(function(truck) {
    debug.print(truck.name)
    features.push({
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": truck.trip
        },
        "properties": {
            "stroke": truck.service == "fuel" ? "#da5000" : "#669d34",
            "stroke-width": 2,
            "stroke-opacity": 1,
            "speedsAtVertices": truck.speeds,
            "waitsAtVertices": truck.waits
        }
    })
    if (truck.stops.length > 0) {
        features = features.concat(truck.stops)
        debug.print('.'+truck.stops.length)
    }
})


fs.writeFileSync(program.O, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.O+' written')