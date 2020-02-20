/*
 * Produces zigzag line string consisting of count times a horizontal displacement of length followed
 * by a vertical displacement of length.
 *
 */
const turf = require('@turf/turf')

const debug = require('./debug.js')

debug.init(true, [""], "main")

function point_on_line(c, n, d) {
    var brng = turf.bearing(c, n)
    const p = turf.destination(c, d, brng)
    return p.geometry.coordinates
}

// limited zigzag funtion, for points in northern, east hemisphere. d should be < 1000km
exports.zigzag = function(start, dst, cnt, options) {
    var fc = []
    var ls = []

    if(options.points)
        fc.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": start
            },
            "properties": {
                "sequence": 0,
                "zigzag": dst
            }
        })
    ls.push(start)

    var curr = start
    for (var i = 1; i <= cnt; i++) {
        var p = point_on_line(curr, [curr[0]+10,curr[1]], dst) // go east
        p[1] = curr[1] // force horiz
        if(options.points)
            fc.push({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": p
                },
                "properties": {
                    "sequence": 0,
                    "zigzag": dst
                }
            })
        ls.push(p)

        var p1 = point_on_line(p, [p[0],0], dst) // go south
        p1[0] = p[0] // force vert
        if(options.points)
            fc.push({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": p1
                },
                "properties": {
                    "sequence": i,
                    "zigzag": dst
                }
            })
        ls.push(p1)

        curr = p1        
    }

    if(ls.length > 1) {
        fc.push({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": ls
            },
            "properties": {}
        })
    }

    return {
        "type": "FeatureCollection",
        "features": fc
    }
}