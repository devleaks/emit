var fs = require('fs');
var moment = require('moment')
var program = require('commander')

program
    .version('0.0.1')
    .description('replaces all linestrings in geojson file with timed linestrings (best run one LS at a time)')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .requiredOption('-s, --speed <speed>', 'Speed of vehicle in km/h')
    .option('-g, --give', 'output events [time, [lon, lat]] array on stdout for each linestring')
    .option('-j, --json', 'output events as json')
    .option('-r, --rate <rate>', 'Rate of event report in seconds, default 30 s', 30)
    .option('-d, --date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('-v, --vertices', 'Emit event at vertices (change of direction)')
    .parse(process.argv)

if (program.debug) console.log(program.opts());

/*!
 * JavaScript function to calculate the destination point given start point latitude / longitude (numeric degrees), bearing (numeric degrees) and distance (in m).
 *
 * Original scripts by Chris Veness
 * Taken from http://movable-type.co.uk/scripts/latlong-vincenty-direct.html and optimized / cleaned up by Mathias Bynens <http://mathiasbynens.be/>
 * Based on the Vincenty direct formula by T. Vincenty, “Direct and Inverse Solutions of Geodesics on the Ellipsoid with application of nested equations”, Survey Review, vol XXII no 176, 1975 <http://www.ngs.noaa.gov/PUBS_LIB/inverse.pdf>
 */
function toRad(n) {
    return n * Math.PI / 180;
}

function toDeg(n) {
    return n * 180 / Math.PI;
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
        sigmaP = 2 * Math.PI;
    while (Math.abs(sigma - sigmaP) > 1e-12) {
        var cos2SigmaM = Math.cos(2 * sigma1 + sigma),
            sinSigma = Math.sin(sigma),
            cosSigma = Math.cos(sigma),
            deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
        sigmaP = sigma;
        sigma = s / (b * A) + deltaSigma;
    };
    var tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1,
        lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)),
        lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1),
        C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha)),
        L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))),
        revAz = Math.atan2(sinAlpha, -tmp); // final bearing
    return [lon1 + toDeg(L), toDeg(lat2)];
}

function bearing(startLat, startLng, destLat, destLng) {
    startLat = toRad(startLat);
    startLng = toRad(startLng);
    destLat = toRad(destLat);
    destLng = toRad(destLng);

    y = Math.sin(destLng - startLng) * Math.cos(destLat);
    x = Math.cos(startLat) * Math.sin(destLat) -
        Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
    brng = Math.atan2(y, x);
    brng = toDeg(brng);
    return (brng + 360) % 360;
}

function distance_int(lat1, lon1, lat2, lon2, unit) {
    if ((lat1 == lat2) && (lon1 == lon2)) {
        return 0;
    } else {
        var radlat1 = Math.PI * lat1 / 180;
        var radlat2 = Math.PI * lat2 / 180;
        var theta = lon1 - lon2;
        var radtheta = Math.PI * theta / 180;
        var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        if (dist > 1) {
            dist = 1;
        }
        dist = Math.acos(dist);
        dist = dist * 180 / Math.PI;
        dist = dist * 60 * 1.1515;
        if (unit == "K") { dist = dist * 1.609344 }
        if (unit == "N") { dist = dist * 0.8684 }
        return dist;
    }
}

function distance(p1, p2) {
    return distance_int(p1[1], p1[0], p2[1], p2[0], 'K')
}


function point_on_line(c, n, d) {
    var brng = bearing(c[1], c[0], n[1], n[0])
    return destVincenty(c[1], c[0], brng, d)
}

function emit(newls, t, p, s, sd) {    //s=(s)tart, (e)dge, (v)ertex, (f)inish
    if(s != 'v' && s != 'f') {
        dt = t
        if(sd && sd.isValid()) {
            dt = moment(sd).add(t, 's').toISOString(true)
        }
        if(program.json)
            r = JSON.stringify({
                "lat": p[1],
                "lon": p[0],
                "ts": dt
            })
        else
            r = '[ "' + dt + '", [' + p[0] + ', ' + p[1]+'] ]'

        if(program.give)
            console.log(r)
        else if(program.debug)
            console.log(s+r) // s+r
        newls.push([p[0], p[1]])
    }
}

/** MAIN **/
var depth = 0
function spit(f) {
    depth++
    if(program.debug) console.log(">".repeat(depth)+f.type)
    if(f.type == "FeatureCollection") {
        f.features.forEach(function(f1, idx) {
            f.features[idx] = spit(f.features[idx])
        })
    } else if(f.type == "Feature") {
        f.geometry = spit(f.geometry)
    } else if(f.type == "LineString") {
        var time = 0 // ticker
        var accel = 0

        const ls = f.coordinates
        var lsidx = 0 // index in linestring
        var newls = []

        var currpos = ls[lsidx] // start pos

        emit(newls, time, currpos, 's', startdate) // start position

        while (lsidx < ls.length - 1) {
            nextvtx = ls[lsidx + 1] // next point (local target)
            left2vtx = distance(currpos, nextvtx) // distance to next point

            while (maxstep < left2vtx) {   // we move maxstep in rate sec. towards vertex
                time += rate
                p = point_on_line(currpos, nextvtx, maxstep)
                emit(newls, time, p, 'e', startdate)   // we should NOT emit at vertices
                currpos = p
                left2vtx -= maxstep
            }

            if (left2vtx > 0) {            // may be portion of segment left (0 < l < d)
                st = rate * left2vtx / maxstep
                time += st
                emit(newls, time, nextvtx, (lsidx == (ls.length - 2)) ? 'f' : 'v', startdate) // vertex
                currpos = nextvtx
                left2vtx = 0
            }
            lsidx += 1
        }
        f.coordinates = newls
        if(program.debug) console.log("new ls:"+newls.length)
    }
    depth--;
    return f
}

/* MAIN
 */
const jsonstring = fs.readFileSync(program.file, 'utf8')

const rate = parseInt(program.rate) // s
var speed = parseInt(program.speed) // km/h
var startdate = moment(program.date)
var maxstep = speed * rate / 3600 // in km, max hop

var fc = spit(JSON.parse(jsonstring))

fs.writeFileSync('out.json', JSON.stringify(fc), { mode: 0o644 });
console.log('out.json written')

