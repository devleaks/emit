const fs = require('fs')
const turf = require('@turf/turf')
const convert = require('color-convert')
var program = require('commander')

const debug = require('./../debug.js')

debug.init(true, [""])

program
    .version('1.0.0')
    .description('Split line string')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug(program.opts())

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

function findFeature(fc, id) {
    var f = false
    var idx = 0
    while (!f && idx < fc.features.length) {
        if (fc.features[idx].id && fc.features[idx].id == id)
            f = fc.features[idx]
        else if (fc.features[idx].properties && fc.features[idx].properties.id && fc.features[idx].properties.id == id)
            f = fc.features[idx]
        idx++
    }
    if (!f)
        debug("feature not found", id)
    return f
}


function pc(fc) {
    var line = findFeature(fc, "way/395285289")
    var splitter = findFeature(fc, "way/395285304")
    return turf.lineSplit(line, splitter);
}

const jsonstring = fs.readFileSync(program.file, 'utf8')

var pc = pc(JSON.parse(jsonstring))

fs.writeFileSync('out.json', JSON.stringify(pc), { mode: 0o644 })
console.log('out.json written')