const fs = require('fs')
const turf = require('@turf/turf')
const convert = require('color-convert')
var program = require('commander')
const debug = require('./debug.js')

debug.init(true, [""])

program
    .version('1.0.0')
    .description('Color point of interest depending on type')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-a, --airport <airport>', 'GeoJSON polygon of airport')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.print(program.opts())

function centroid(polygon) {
    return polygon
}

function toPointFeatureCollection(points) {
    var fc = []
    points.forEach(function(p, i) {
        fc.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": p
            }
        })
    })

    return {
        "type": "FeatureCollection",
        "features": fc
    }
}

function toPoints(fc) {
    var points = []
    fc.features.forEach(function(f, i) {
        if(f.geometry.type == "Point")
            points.push(f.geometry.coordinates)
    })

    return points
}

var depth = 0

function pc(f, airport) {
    depth++

    // debug.print(">".repeat(depth) + (f.type == "Feature" ? f.type + "(" + f.geometry.type + ")" : f.type))
    if (f.type == "FeatureCollection") {
        var newfc = []
        f.features.forEach(function(f1, idx) {
            var t = pc(f.features[idx], airport)
            if (t) {// keep feature
                newfc.push(t)
            }
        })
        f.features = newfc
        return f
    }
    var ret = false
    // debug.print("doing..", f.id)
    switch(f.geometry.type) {
        case "Point": // keep only points inside airport area
            ret = turf.booleanPointInPolygon(f.geometry.coordinates, airport) ? f : false
            break
        case "LineString": // keep only points inside airport area
            var fcpoints = toPointFeatureCollection(f.geometry.coordinates)
            var fcpoints_inside = turf.pointsWithinPolygon(fcpoints, airport)
            f.geometry.coordinates = toPoints(fcpoints_inside)
            debug.print(f.id, f.geometry.coordinates.length)
            ret = f.geometry.coordinates.length > 1 ? f : false
            break
        case "MultiLineString": // keep only points inside airport area
            ret = f
            break
        case "Polygon": // keep if entire polygon inside airport area
            ret = turf.booleanWithin(f, airport) ? f : false
            break
        default:
            debug.print("No process", f)
    }
    // debug.print(f.geometry.type, f.id, ret)
    return ret
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
const jsonstring2 = fs.readFileSync(program.airport, 'utf8')

var pc = pc(JSON.parse(jsonstring), JSON.parse(jsonstring2))

fs.writeFileSync('out.json', JSON.stringify(pc), { mode: 0o644 })
console.log('out.json written')