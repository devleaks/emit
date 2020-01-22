/*
 * Produces zigzag line string consisting of count times a horizontal displacement of length followed
 * by a vertical displacement of length.
 *
 */
var fs = require('fs')
var moment = require('moment')
var program = require('commander')

/*php:
git describe --tags
git log -1 --format=%cd --relative-date


var sys = require('sys')
var exec = require('child_process').exec;
function puts(error, stdout, stderr) { sys.puts(stdout) }
exec("ls -la", puts);

*/
// @todo: change zigzag option to action
program
    .version('0.2.0')
    .description('replaces all linestrings in geojson file with timed linestrings (best run one LS at a time)')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "zigzag.json")
    .requiredOption('-l, --length <length>', 'Length of segment')
    .requiredOption('-c, --count <count>', 'Count of zigzags')
    .parse(process.argv)

debug(program.opts())


/* Produces debug based on program.debug option if it exist, otherwise constructor is supplied.
 * Function name must be part of valid list of functions to debug
 * Preceedes debug output with calling function name.
 */
function debug(...args) {
//  const program = { "debug": true , "funcname": false }
    if (typeof(program) != "undefined" && program.debug) {
        const MAIN = "main()"
        var FUNCDEBUG = [
            "", // always debug top-level
            MAIN
        ]
        if(program.funcname)
            FUNCDEBUG = FUNCDEBUG.concat(program.funcname)
        var caller = debug.caller ? debug.caller : {"name": MAIN}

        if (FUNCDEBUG.indexOf(caller.name) >= 0)
            console.log(caller.name, args)
    }
}

// TO DO
// add ETA at vertices

/*!
 * JavaScript function to calculate the destination point given start point latitude / longitude (numeric degrees), bearing (numeric degrees) and distance (in m).
 *
 * Original scripts by Chris Veness
 * Taken from http://movable-type.co.uk/scripts/latlong-vincenty-direct.html and optimized / cleaned up by Mathias Bynens <http://mathiasbynens.be/>
 * Based on the Vincenty direct formula by T. Vincenty, “Direct and Inverse Solutions of Geodesics on the Ellipsoid with application of nested equations”, Survey Review, vol XXII no 176, 1975 <http://www.ngs.noaa.gov/PUBS_LIB/inverse.pdf>
 */
function toRad(n) {
    return n * Math.PI / 180
}

function toDeg(n) {
    return n * 180 / Math.PI
}

function destVincenty(lat1, lon1, brng, dist) {
    var a = 6378137,
        b = 6356752.3142,
        f = 1 / 298.257223563, // WGS-84 ellipsiod
        s = dist,
        alpha1 = toRad(brng),
        sinAlpha1 = Math.sin(alpha1),
        cosAlpha1 = Math.cos(alpha1),
        tanU1 = (1 - f) * Math.tan(toRad(lat1)),
        cosU1 = 1 / Math.sqrt((1 + tanU1 * tanU1)),
        sinU1 = tanU1 * cosU1,
        sigma1 = Math.atan2(tanU1, cosAlpha1),
        sinAlpha = cosU1 * sinAlpha1,
        cosSqAlpha = 1 - sinAlpha * sinAlpha,
        uSq = cosSqAlpha * (a * a - b * b) / (b * b),
        A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq))),
        B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq))),
        sigma = s / (b * A),
        sigmaP = 2 * Math.PI
    while (Math.abs(sigma - sigmaP) > 1e-12) {
        var cos2SigmaM = Math.cos(2 * sigma1 + sigma),
            sinSigma = Math.sin(sigma),
            cosSigma = Math.cos(sigma),
            deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)))
        sigmaP = sigma
        sigma = s / (b * A) + deltaSigma
    };
    var tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1,
        lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)),
        lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1),
        C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha)),
        L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))),
        revAz = Math.atan2(sinAlpha, -tmp) // final bearing
    return [lon1 + toDeg(L), toDeg(lat2)]
}

function bearing(startLat, startLng, destLat, destLng) {
    startLat = toRad(startLat)
    startLng = toRad(startLng)
    destLat = toRad(destLat)
    destLng = toRad(destLng)

    y = Math.sin(destLng - startLng) * Math.cos(destLat)
    x = Math.cos(startLat) * Math.sin(destLat) -
        Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng)
    brng = Math.atan2(y, x)
    brng = toDeg(brng)
    return (brng + 360) % 360
}

function distance_int(lat1, lon1, lat2, lon2, unit) {
    if ((lat1 == lat2) && (lon1 == lon2)) {
        return 0
    } else {
        var radlat1 = Math.PI * lat1 / 180
        var radlat2 = Math.PI * lat2 / 180
        var theta = lon1 - lon2
        var radtheta = Math.PI * theta / 180
        var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta)
        if (dist > 1) {
            dist = 1
        }
        dist = Math.acos(dist)
        dist = dist * 180 / Math.PI
        dist = dist * 60 * 1.1515
        if (unit == "K") { dist = dist * 1.609344 }
        if (unit == "N") { dist = dist * 0.8684 }
        return dist
    }
}

function distance(p1, p2) {
    return distance_int(p1[1], p1[0], p2[1], p2[0], 'K')
}


function point_on_line(c, n, d) {
    var brng = bearing(c[1], c[0], n[1], n[0])
    return destVincenty(c[1], c[0], brng, 1000 * d) // distance must be in meter
}


// limited zigzag funtion, for points in northern, east hemisphere. d should be < 1000km
function zigzag(start, dst, cnt) {
    var fc = []
    var ls = []

    if(program.points)
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
        if(program.points)
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
        if(program.points)
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

/* MAIN
 */
const count = parseInt(program.count)
const length = parseInt(program.length) // km

fs.writeFileSync(program.O, JSON.stringify(zigzag([4.3483286,50.8445793],length,count)), { mode: 0o644 })
console.log(program.O + ' written')
