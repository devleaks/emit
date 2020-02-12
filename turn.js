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
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, ["", "mkturn", "lineOffset", "adjustLineOffset"], "main")
debug.print(program.opts())



function adjustLineOffset(line, offset, precision, count) {
    var offs = offset
    var diff = offset
    while(--count > 0 && Math.abs(diff) > precision) {
        const newline = turf.lineOffset(line, offs)
        diff = offset - turf.distance(line.coordinates[0], newline.geometry.coordinates[0])
        offs = offs + 0.5 * diff
        //debug.print(count, offset, precision, offs, diff)
    }
    debug.print(offset, precision, offs, diff)
    return offs
}

function lineOffset(line, offset) {
    newr = adjustLineOffset(line, offset, 0.001, 30)
    debug.print(offset, newr)
    return turf.lineOffset(line, newr)
}

function mkturn(l1, l0, l2, radius) {
    var features = []
    features.push(geojson.Feature(geojson.Point(l1)))
    features.push(geojson.Feature(geojson.Point(l0)))
    features.push(geojson.Feature(geojson.Point(l2)))
    var line1 = [l1, l0]
    features.push(geojson.Feature(geojson.LineString(line1)))
    var line2 = [l0, l2]
    features.push(geojson.Feature(geojson.LineString(line2)))
    var bearing1 = turf.bearing(l1, l0)
    var bearing2 = turf.bearing(l0, l2)

    debug.print(bearing1, bearing2)

    var line1b = lineOffset(geojson.LineString(line1), radius)
    var line2b = lineOffset(geojson.LineString(line2), radius)

    debug.print(radius, turf.distance(l1, line1b.geometry.coordinates[0]))
    debug.print(radius, turf.distance(l2, line2b.geometry.coordinates[1]))

    features.push(line1b)
    features.push(line2b)

    var intersects = turf.lineIntersect(line1b, line2b)
    if (intersects.features.length > 0) {
        var center = intersects.features[0]
        features.push(center)

        var pie = turf.lineArc(center.geometry.coordinates, radius, bearing1, -bearing2)
        // features.push(pie)

        var pie2 = turf.transformRotate(pie, -90, {pivot: center})
        features.push(pie2)
    } else {
        console.log("no intersect")
    }

    return features
}

var features = mkturn([4.3483, 50.884], [4.49000228484059, 50.8445793], [4.49000228484059, 50.754687164888345], 5)

fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.output + ' written')