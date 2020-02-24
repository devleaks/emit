/*
 * 
 */

const fs = require('fs')
const moment = require('moment')
const turf = require('@turf/turf')

var program = require('commander')

const geojson = require('./geojson-util')
const debug = require('./debug.js')


program
    .version('1.0.0')
    .description('generates flights from flight board (departure and arrival)')
    .option('-d, --debug', 'output extra debugging')
    .option('-f, --file <file>', 'Save to file, default to out.json', "out.json")
    .option('-r, --radius <r>', 'radius', 6)
    .option('-i, --bearing-in <in>', 'bearing in', 0)
    .option('-o, --bearing-out <out>' , 'bearing out', 90)
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())



function mkturn(l1, l0, l2, radius) {
    var features = []
    const green = {
        "marker-color": "#00fa00",
        "marker-size": "medium",
        "marker-symbol": ""
    }
    features.push(geojson.Feature(geojson.Point(l1), green))
    features.push(geojson.Feature(geojson.Point(l0), green))
    features.push(geojson.Feature(geojson.Point(l2), green))

    var pie = turf.lineArc(l0, program.radius, program.bearingIn, program.bearingOut)
    features.push(pie)

    return features
}

var features = mkturn([4.100, 50.884], [4.490, 50.884], [4.100, 50.754], 5)

fs.writeFileSync(program.file, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.file + ' written')