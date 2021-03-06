import * as geojson from "./geojson-util.js";
import * as vehicle from "./device.js";
import * as debug from "./debug.js";
import * as config from "../data/sim-config-transport.js";
import * as roadsData from "./roads.js";
import * as trucksData from "./truck.js";

var roads = roadsData.init(config)
var trucks = trucksData.init(config)

/*
 * TRUCK LEAVES LOGISTICS BAY TO BORDER
 */
export const leave = function(roads, truck_name, truck_model, parking_name, to_border, handler) {
    var truck = new vehicle.Device(truck_name, { "model": truck_model, "movement": to_border, "handler": handler })
    var p, p1, p2
    var p_name // point"s name
    var syncCount = 0

    const truckModel = trucksData.findModel(truck.getProp("model"))
    if (!truckModel) {
        debug.error("cannot find truckModel model", truckModel)
        return false
    } else
        debug.print("truckModel", truckModel)

    // first point is parking position
    const parking = geojson.findFeature(parking_name, roads.parkings, "name")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }
    truck.addPointToTrack(parking, 0, 60) // waits 60 secs before leaving bay

    truck.addMarker(
        "leave",
        parking,
        0,
        null,
        syncCount++,
        truck.getProp("color"), {
            "device": truck.name,
            "handler": handler,
            "action": "leave",
            "posname": parking.properties.name
        })

    // moves to local roads
    p = geojson.findClosest(parking, roads.localroads)
    if (p) {
        truck.addPointToTrack(p, truckModel.slow, null) // 60 seconds to detach tow pushback
    } else {
        debug.error("cannot find local road point", parking_name)
        return false
    }

    // route from parking to highway entry
    var highway_entry = "HE:E42" + (to_border.substr(0, 6).toLowerCase() == "france" ? "O" : "E")
    var he = geojson.findFeature(highway_entry, roads.localroads, "name")

    p1 = geojson.findClosest(he, roads.localroads)

    // route to highway entry
    var r = geojson.route(p, p1, roads.localroads)
    truck.addPathToTrack(r.coordinates, truckModel["slow"], null)

    // highway entry
    truck.addPointToTrack(he, truckModel["slow"], null)
    truck.addMarker(
        "enterhighway",
        he,
        truckModel["slow"],
        null,
        syncCount++,
        truck.getProp("color"), {
            "device": truck.name,
            "handler": handler,
            "action": "enter",
            "posname": highway_entry
        })


    // highway to border (note: First point of linestring should be close to parking, last point is at border)
    p = roads.highways[to_border].features[0]
    var last = false
    if (p) { // @todo: Add line string?
        p.geometry.coordinates.forEach(function(c, idx) {
            truck.addPointToTrack(c, truckModel.speed, null)
            last = c
        })
    } else {
        debug.error("cannot find highway", to_border)
        return false
    }

    // should add a point when leaving airspace?
    truck.addMarker(
        "exitcountry",
        last,
        truckModel.speed,
        null,
        syncCount++,
        truck.getProp("color"), {
            "device": truck.name,
            "handler": handler,
            "action": "borderout",
            "posname": to_border
        })

    return truck
};

/*
 * TRUCK ARRIVES AT LOGISTICS BAY
 */
export const arrive = function(roads, truck_name, truck_model, parking_name, from_border, handler) {
    var truck = new vehicle.Device(truck_name, { "model": truck_model, "movement": from_border, "handler": handler })
    var p, p1, p2
    var p_name // point"s name
    var syncCount = 0

    const truckModel = trucksData.findModel(truck.getProp("model"))
    if (!truckModel) {
        debug.error("cannot find truckModel model", truck.getProp("model"))
        return false
    } else
        debug.print("truckModel", truckModel)


    // highway to border
    p = roads.highways[from_border].features[0]
    var first = true
    if (p) { // (note: First point of linestring should be close to parking, last point is at border)
        const rev = geojson.cleanCopy(p.geometry.coordinates).reverse()
        rev.forEach(function(c) {
            if (first) {
                first = false
                truck.addPointToTrack(c, truck.speed, null)
                truck.addMarker(
                    "entercountry",
                    c,
                    truck.speed,
                    null,
                    syncCount++,
                    truck.getProp("color"), {
                        "device": truck.name,
                        "handler": handler,
                        "action": "borderin",
                        "posname": from_border
                    })
            } else {
                truck.addPointToTrack(c, null, null)
            }
        })
    } else {
        debug.error("cannot find highway", from_border)
        return false
    }


    // add STAR rendez-vous (vehicle to all runways)
    var highway_exit = "HX:E42" + (from_border.substr(0, 6).toLowerCase() == "france" ? "O" : "E")
    p = geojson.findFeature(highway_exit, roads.localroads, "name")

    if (p) {
        truck.addPointToTrack(p, vehicle.to_kmh(truckModel.vapproach), null)
        truck.addMarker(
            "exithighway",
            p,
            truck.slow,
            null,
            syncCount++,
            truck.getProp("color"), {
                "device": truck.name,
                "handler": handler,
                "action": "exit",
                "posname": highway_exit
            })
    } else {
        debug.error("cannot find highway exit", highway_exit)
        return false
    }

    // highway exit to localroad
    p1 = geojson.findClosest(p, roads.localroads)
    truck.addPointToTrack(p1, truck.slow, null)


    // closest point to parking on localroad
    const parking = geojson.findFeature(parking_name, roads.parkings, "name")
    if (!parking) {
        debug.print("parking not found", parking_name)
        return false
    }
    p2 = geojson.findClosest(parking, roads.localroads)

    // route to it
    var r = geojson.route(p1, p2, roads.localroads)
    truck.addPathToTrack(r.coordinates, truckModel["slow"], null)

    // from last point to parking
    truck.addPointToTrack(parking, 0, 60) // waits 60 secs at bay before turning engine off

    truck.addMarker(
        "park",
        parking,
        0,
        null,
        syncCount++,
        truck.getProp("color"), {
            "device": truck.name,
            "handler": handler,
            "action": "park",
            "posname": parking.properties.name
        })

    return truck
};