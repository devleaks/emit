/*  Formules: https://en.wikipedia.org/wiki/Standard_rate_turn
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
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .parse(process.argv)

debug.init(program.debug, ["", "mkturn"], "main")
debug.print(program.opts())


function computerRadius() {
    return 5 //km
}

function adjustLineOffset(line, offset, precision, count) {
    var offs = Math.abs(offset)
    const soffset = Math.sign(offset)
    var diff = offset
    while (--count > 0 && Math.abs(diff) > precision) {
        const newline = turf.lineOffset(line, soffset * offs)
        diff = Math.abs(offset) - turf.distance(line.coordinates[0], newline.geometry.coordinates[0])
        offs = offs + 0.5 * diff
        debug.print(count, offset, precision, offs, diff)
    }
    debug.print("out", offset, precision, offs, diff)
    return soffset * offs
}


// round to precision for display
function rn(p, n = 4) {
    r = Math.pow(10, n)
    return Math.round(p * r) / r
}


// take a line and extends it both ways (approximation)
function extendLine(line, dist = 20) {
    var bearing = turf.bearing(line.geometry.coordinates[0], line.geometry.coordinates[1])
    var far0 = turf.destination(line.geometry.coordinates[1], dist, bearing)
    var far1 = turf.destination(line.geometry.coordinates[0], dist, bearing + 180)
    return geojson.Feature(geojson.LineString([far0.geometry.coordinates, far1.geometry.coordinates]))
}


// shift a line and extends it
function lineOffset(line, offset) {
    newr = adjustLineOffset(line, offset, 0.001, 30)
    debug.print(offset, newr)
    var l1 = turf.lineOffset(line, newr)
    return extendLine(l1)
}


function isRightTurn(bi, bo) { // returns 1 if right turn, -1 if left turn
    var s = bo - bi
    if (s < 0) s += 360
    debug.print(rn(bi, 0), rn(bo, 0), rn(s, 0), (s >= 0 & s < 180) ? 1 : -1)
    return (s >= 0 & s < 180) ? 1 : -1
}


function isFromRight(bi, bo) { // returns 1 if coming from right, -1 if coming from left
    var s = bi - bo
    if (s < 0) s += 360
    debug.print(bi, bo, s, (s >= 0 & s < 180) ? -1 : 1)
    return (s >= 0 & s < 180) ? -1 : 1
}


function goSouth(l1, l0, l2) { // not correct in South hemisphere
    return l0[1] > l1[1]
}


function goEast(l1, l0, l2) { // not correct west of Greenwich
    return l0[0] > l1[0]
}

cnt = 0

function mkturn(l1, l0, l2, radius) {
    var features = []
    cnt++
    debug.print(l1, l0, l2, radius)
    features.push(geojson.Feature(geojson.Point(l1), {
        "marker-color": "#dddddd",
        "marker-size": "medium",
        "marker-symbol": "d" //departure
    }))
    features.push(geojson.Feature(geojson.Point(l0), {
        "marker-color": "#999999",
        "marker-size": "medium",
        "marker-symbol": "t" //turn
    }))
    features.push(geojson.Feature(geojson.Point(l2), {
        "marker-color": "#222222",
        "marker-size": "medium",
        "marker-symbol": "a" //arrival
    }))

    var center = turf.center(geojson.FeatureCollection(features))
    geojson.colorPoint(center, "#dd2222", cnt.toString())
    features.push(center)


    var line1 = [l1, l0]
    features.push(geojson.Feature(geojson.LineString(line1)))
    var line2 = [l0, l2]
    features.push(geojson.Feature(geojson.LineString(line2)))
    var bearing1 = turf.bearing(l1, l0)
    var bearing2 = turf.bearing(l0, l2)
    var turn = bearing2 - bearing1
    if (turn < 0) turn += 360
    //    if (turn > 180) turn += 360
    const turnRight = isRightTurn(bearing1, bearing2)
    const fromRight = isFromRight(bearing1, bearing2)
    const need2flip = fromRight

    if (bearing1 < 0) bearing1 += 360
    if (bearing2 < 0) bearing2 += 360


    function needFlip() {
        return goSouth(l1, l0, l2)
    }

    debug.print("bearings", {
        id: cnt,
        in: rn(bearing1, 0),
        out: rn(bearing2, 0),
        turn: rn(turn, 0),
        turnRight: turnRight,
        fromRight: fromRight,
        goSouth: goSouth(l1, l0, l2),
        goEast: goEast(l1, l0, l2),
        needFlip: needFlip()
    })

    var line1b = lineOffset(geojson.LineString(line1), turnRight * radius) // offset line is always on right side of line
    var line2b = lineOffset(geojson.LineString(line2), fromRight * radius)

    //debug.print(radius, turf.distance(l1, line1b.geometry.coordinates[0]))
    //debug.print(radius, turf.distance(l2, line2b.geometry.coordinates[1]))

    features.push(line1b)
    features.push(line2b)

    var intersects = turf.lineIntersect(line1b, line2b)
    if (intersects.features.length > 0) {
        var center = intersects.features[0]
        features.push(center)

        var pie2
        if (needFlip()) {
            pie2 = turf.lineArc(center.geometry.coordinates, radius, bearing1 - 90, bearing2 - 90)
        } else {
            pie2 = turf.lineArc(center.geometry.coordinates, radius, bearing2 - 270, bearing1 - 270)
            pie2.geometry.coordinates = pie2.geometry.coordinates.reverse()
        }
        features.push(pie2)

        var newl1 = geojson.Feature(geojson.Point(pie2.geometry.coordinates[0]))
        var newl2 = geojson.Feature(geojson.Point(pie2.geometry.coordinates[pie2.geometry.coordinates.length - 1]))

        features.push(newl1)
        features.push(newl2)

        // route:
        var newls = geojson.LineString([l1, newl1.geometry.coordinates])
        // add turn
        newls.coordinates = newls.coordinates.concat(pie2.geometry.coordinates)
        // add exit
        newls.coordinates.push(newl2.geometry.coordinates)
        newls.coordinates.push(l2)

        features.push(geojson.Feature(newls, {
            "stroke": "#ff2600",
            "stroke-width": 2,
            "stroke-opacity": 1
        }))

    } else {
        console.log("no intersect")
    }

    return features
}

var features = []

if (program.file) {
    const r = 5
    const jsonstring = fs.readFileSync(program.file, 'utf8')
    fc = JSON.parse(jsonstring)
    for (var i = 0; i < fc.features.length; i += 1) {
        var t
        if (fc.features[i].geometry.type == "LineString") {
            t = mkturn(fc.features[i].geometry.coordinates[0],
                fc.features[i].geometry.coordinates[1],
                fc.features[i].geometry.coordinates[2],
                r)
        } else {
            t = mkturn(fc.features[i].geometry.coordinates,
                fc.features[i + 1].geometry.coordinates,
                fc.features[i + 2].geometry.coordinates,
                r)
            i += 2
        }
        features = features.concat(t)
    }
}





fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.output + ' written')