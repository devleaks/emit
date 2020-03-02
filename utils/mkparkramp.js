/*
 * Parkings are supplied as a FetaureCollection of Polygons.
 * Parking centroid finds the centroid of each polygon and produces a FeatureCollection of Points.
 *
 */
const fs = require('fs')
const turf = require('@turf/turf')
var program = require('commander')

const debug = require('../lib/debug.js')
const geojson = require('../lib/geojson-util.js')


program
    .version('1.0.0')
    .description('make ramp of parking from linestring')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.print(program.opts())

function mkramp(ls) {
    var features = []
    var chunks = turf.lineChunk(ls, 0.004, { units: 'kilometers' })
    chunks.features.forEach(function(c, idx) {
      var p = geojson.Feature(geojson.Point(c.geometry.coordinates[0]), {
        ramp: ls.properties.name,
        name: ls.properties.name+":"+idx
      })
      features.push(p)
    })
    return features
}

var depth = 0

function pc(fc) {
    var features = []
    fc.features.forEach(function(f, idx) {
        features = features.concat(mkramp(f))
    })
    return geojson.FeatureCollection(features)
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
var pc = pc(JSON.parse(jsonstring))

fs.writeFileSync('out.json', JSON.stringify(pc), { mode: 0o644 })
console.log('out.json written')