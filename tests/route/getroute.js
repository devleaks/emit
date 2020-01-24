const fs = require('fs')
var PathFinder = require('geojson-path-finder')
var geojsonTool = require('geojson-tools')
const turf = require('@turf/turf')
const geojson = require('./../../geojson-util')

//    geojson = require('./eblg-taxi.json');

var jsonfile = fs.readFileSync('./../../eblg/json/eblg-serviceroads.geojson', 'utf8')
var network = JSON.parse(jsonfile)

network.features.forEach(function(f) {
    if (f.geometry.type == "LineString")
        f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
});

jsonfile = fs.readFileSync('./../../eblg/json/eblg-parkings.geojson', 'utf8')
var parkings = JSON.parse(jsonfile)

/* Convert a FeatureCollection of LineString into a single MultiLineString geometry
 * as required for some turf functions.
 * Returns MultiLineString
 */
function multilinestring(fc) {
    var mls = []
    fc.features.forEach(function(f, idx) {
        if (f.geometry.type == "LineString")
            mls.push(f.geometry.coordinates)
    })
    return geojson.MultiLineString(mls)
}

/* Find closest point to network of roads (FeatureCollectionof LineStrings)
 * Returns Point
 */
function findClosest(p, network) {
    if (typeof(p.nearestPointOnLine) == "undefined" || typeof(p.nearestPointOnLine[network.mlsname]) == "undefined") {
        p.nearestPointOnLine = p.nearestPointOnLine ? p.nearestPointOnLine : {}
        if (typeof(network.mls) == "undefined") { // build suitable structure for nearestPointOnLine, cache it.
            network.mls = multilinestring(network)
        }
        p.nearestPointOnLine[network.mlsname] = turf.nearestPointOnLine(network.mls, p)
    }
    return p.nearestPointOnLine[network.mlsname]
}



var pathfinder = new PathFinder(network, {
    precision: 0.0005
});

const p_from = {
    "type": "Feature",
    "geometry": {
        "type": "Point",
        "coordinates": [
            5.463096499443054,
            50.6452051638321
        ]
    },
    "properties": {
        "marker-color": "#aa0000",
        "marker-size": "medium",
        "marker-symbol": ""
    }
}
var idx = Math.floor(Math.random()*parkings.features.length)
const p_to = parkings.features[idx]

console.log(p_to)

/*
const p_to = {
    "type": "Feature",
    "geometry": {
        "type": "Point",
        "coordinates": [
            5.434198379516602,
            50.637077827895
        ]
    },
    "properties": {
        "marker-color": "#0000aa",
        "marker-size": "medium",
        "marker-symbol": ""
    }
}
*/

var c_from = findClosest(p_from, network)
c_from.properties |= {}
c_from.properties["marker-color"] = "#dd4444"
c_from.properties["marker-size"] = "medium"
c_from.properties["marker-color"] = "#dd4444"

var c_to = findClosest(p_to, network)
c_to.properties |= {}
c_to.properties["marker-color"] = "#dd4444"
c_to.properties["marker-size"] = "medium"
c_to.properties["marker-color"] = "#4444dd"

var trajet = {
    type: "FeatureCollection",
    features: [p_from, c_from, p_to, c_to]
}

var path = pathfinder.findPath(c_from, c_to)

if (path) {
    trajet.features.push({
        type: 'Feature',
        properties: {
            "stroke": "#00fa00",
            "stroke-width": 2,
            "stroke-opacity": 1,
            "name": 'Shortest path'
        },
        geometry: {
            type: "LineString",
            coordinates: path.path
        }
    })
} else {
    console.log('Cannot find path');
}
fs.writeFileSync('out.json', JSON.stringify(trajet), { mode: 0o644 })
console.log('out.json written')