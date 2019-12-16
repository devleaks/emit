var fs = require('fs');
var moment = require('moment')
var program = require('commander')

// @todo: change zigzag option to action
program
    .version('0.0.1')
    .description('replaces all linestrings in geojson file with timed linestrings (best run one LS at a time)')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .requiredOption('-s, --speed <speed>', 'Speed of vehicle in km/h')
    .option('-a, --accel', 'Take acceleration/deceleration into consideration')
    .option('-g, --give', 'output events [time, [lon, lat]] array on stdout for each linestring')
    .option('-j, --json', 'output events as json')
    .option('-p, --points', 'add points to feature collection')
    .option('-r, --rate <rate>', 'Rate of event report in seconds, default 30 s', 30)
    .option('--start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('--min-speed <speed>', 'Minimum speed for objects (km/h)', 5)
    .option('-v, --vertices', 'Emit event at vertices (change of direction)')
    .option('-l, --last-point', 'Emit event at last point of line string, even if time rate is not elapsed')
    .option('-z, --zigzag', 'Generate demo file')
    .parse(process.argv)

debug(program.opts())

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


function get_speed(currpos, lsidx, ls, speeds) { // linear acceleration
    var totald = distance(ls[lsidx], ls[lsidx+1])
    var s = 0
    if(totald == 0) {
        s = speeds[lsidx+1]
    } else {
        var partiald = distance(ls[lsidx], currpos)
        var portion = partiald/totald
        s = speeds[lsidx] + portion * (speeds[lsidx+1] - speeds[lsidx])
    }
    return s
}


// we're at currpos, heading to nextvtx
// we move rate seconds in that direction
// returns where we land after rate seconds
function point_in_rate_sec(currpos, rate, lsidx, ls, speeds) {
    // We are at currpos, between ls[lsidx] and ls[lsidx+1]. We go towards ls[idx+1] for rate seconds.
    // 1. What is the speed at currpos. We assume linear accelleration.
    var totald = distance(ls[lsidx], ls[lsidx+1])
    var partiald = distance(ls[lsidx], currpos)
    var leftd = totald - partiald // leftd = distance(currpos, ls[lsidx+1])
    var portion = partiald/totald
    var v0 = speeds[lsidx] + portion * (speeds[lsidx+1] - speeds[lsidx])
    var v1 = speeds[lsidx+1]
    var acc = (speeds[lsidx+1]*speeds[lsidx+1]-speeds[lsidx]*speeds[lsidx])/(2*totald)

    // 2. Given the speedatcurrpos and speeds[idx+1] at ls[idx+1] how far do we travel duing rate seconds?
    var hourrate = rate / 3600
    var dist = v0 * hourrate + acc * hourrate * hourrate / 2

    var nextpos = point_on_line(currpos, ls[lsidx+1], dist) 

    /*debug({
        "prevvtx": ll(ls[lsidx]),
        "startp": ll(currpos),
        "nextvtx": ll(ls[lsidx+1]),
        "nextpos": ll(nextpos),
        "totald": totald,
        "covered": partiald,
        "lefd": leftd,
        "prevspeed": speeds[lsidx],
        "nextspeed": speeds[lsidx+1],
        "currspeed": v0,
        "accel": acc,
        "time": rate,
        "time/h": rate/3600,
        "dist": dist,
        "leftvtx": distance(nextpos,ls[lsidx+1])
     })
     */

    return nextpos
}


function emit(newls, t, p, s, sd, pts, spd, cmt) {    //s=(s)tart, (e)dge, (v)ertex, (f)inish
    var k = s.charAt(0)
    if(    (k == 's' || k == 'e')
        || (k == 'v' && program.vertices)
        || (k == 'f' && program.lastPoint) ) {
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
        else
            debug(s+r) // s+r
        newls.push([p[0], p[1]])
        pts.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": p
            },
            "properties": {
                "timestamp": dt,
                "sequence": pts.length,
                "speed": spd,
                "note": cmt
            }
        })
    }
}


/* Attempt to manage a change of speed between edges.
 *
 */

// Shortcut:
// From a table (vertex index,speed at that vertex) for some vertex only,
// we build a simple table (vertex index, speed at vertex) for all vertices
// we also get a table (vertex index, time at that vertext).

function fillSpeed(a, len) {
    const minSpeed = parseFloat(program.minSpeed)
    const dft = parseFloat(program.speed)
    function nexta(arr, from, max) { // returns next array item index with non undefined value
        if( from == (max-1) )
            return from
        var i = from+1
        while(i < max && typeof(arr[i]) == "undefined")
            i++
        return i
    }
    if (typeof(a[0]) == "undefined")
        a[0] = dft < minSpeed ? minSpeed : dft

    for(var i = 1; i < len; i++) {
        if (typeof(a[i]) == "undefined") {
            var j = nexta(a, i, len)
            if ((j == len) && (typeof(a[j]) == "undefined")) {// no last value, set last val to default
                a[j] = dft
            }
            var d = a[j] < minSpeed ? minSpeed : a[j] // target value
            var s = (d - a[i-1])/(j-i+1) // slope
            for(var k = i; k < j; k++) {
                a[k] = a[i-1]+(k-i+1)*s
            }
            i = j
        } else {
            a[i] = a[i] < minSpeed ? minSpeed : a[i]
        }// else a is set
    }
}//@@todomust check that there are no 2 speeds=0 following each other with d>0


function sec2hms(i) {
    totalSeconds = Math.round(i * 3600)
    hours = Math.floor(totalSeconds / 3600)
    totalSeconds %= 3600
    minutes = Math.floor(totalSeconds / 60)
    seconds = totalSeconds % 60
    minutes = String(minutes).padStart(2, "0")
    hours = String(hours).padStart(2, "0")
    seconds = String(seconds).padStart(2, "0")
    var msec = Math.round(totalSeconds*1000)/1000
    return hours + ":" + minutes + ":" + seconds // + "." + msec
}

function eta(ls,speed) {
    var eta = []
    eta[0] = 0
    debug(speed)
    for(var i = 1; i < speed.length; i++) {
        var t = 0
        var d = distance(ls[i-1],ls[i])
        if(speed[i-1] != speed[i]) {
            t = 2 * d / Math.abs(speed[i]+speed[i-1]) // acceleration is uniform, so average speed is OK for segment.
        } else {
            t = d / Math.max(speed[i-1],speed[i])
        }
        eta[i] = eta[i-1] + t
        debug("v"+i,Math.round(1000*d)/1000,speed[i-1],speed[i],Math.round(3600000*t)/1000,sec2hms(t,2),sec2hms(eta[i],2))
    }
    return eta
}

function time2vtx(p, idx, ls, sp, rate) {
    var d  = distance(p, ls[idx+1])
    var d0  = distance(ls[idx], p)
    var de = distance(ls[idx], ls[idx+1])
    var vp = 0
    if(d0 == 0)
        vp = sp[idx]
    else if(d == 0)
        vp = sp[idx+1]
    else
        vp = sp[idx] + (d0/de) * (sp[idx+1] - sp[idx])   // speed at point, if linear acceleration

    vp = vp < 5 ? 5 : vp

    debug('time2vtx ', d, de, sp[idx], sp[idx+1], vp)

    var t = 0
    if((vp+sp[idx+1]) != 0)
        t = 2 * d / (vp+sp[idx+1])                      // again, we assume constant acceleration so avg speed is fine

    var r = Math.round(t * 3600000)/1000
    debug('>>> TO', idx+1, d+" km left", r+" secs needed")
    // control

    p1 = point_in_rate_sec(p, rate, idx, ls, sp)
    d1 = distance(p1, ls[idx+1])
    p2 = point_in_rate_sec(p, r, idx, ls, sp)
    d2 = distance(p2, ls[idx+1])
    d3 = distance(p,p1)
    d4 = distance(p,p2)
    debug("CONTROL", {
        "index": idx,
        "d2next": d,
        "dfprev": d0,
        "dtot": de,
        "v0": sp[idx],
        "v1": sp[idx+1],
        "vp": vp,
        "time2vtx": r,
        "control:d2next(rate)": d1,
        "control:d2next(time2vtx)": d2,
        "control:d3travel(rate)": d3,
        "control:d4travel(time2vtx)": d4
     })

    return r
}   

function ll(p, n = 4) {
    r = Math.pow(10, n)
    return "("+Math.round(p[1]*r) / r + ',' + Math.round(p[0]*r) / r+")"
}

function rn(p, n = 4) {
    r = Math.pow(10, n)
    return Math.round(p*r) / r
}

function debug(...args) {
  if(program.debug)
    console.log(args)
}

/** MAIN **/
var depth = 0
var points = []             // points where position is broadcasted
var stop = 0
function spit(f, speedsAtVertices, rate, startdate) {
    depth++

    debug(">".repeat(depth)+(f.type == "Feature" ? f.type+"("+f.geometry.type+")": f.type))
    if(f.type == "FeatureCollection") {
        f.features.forEach(function(f1, idx) {
            f.features[idx] = spit(f.features[idx], speedsAtVertices, rate, startdate)
        })
        if(points.length > 0 && program.points) {
            f.features = f.features.concat(points)
        }
    } else if(f.type == "Feature") {
        var speeds = (f.geometry.type == "LineString" && f.properties && f.properties.speedsAtVertices) ?
                    f.properties.speedsAtVertices : speedsAtVertices
        f.geometry = spit(f.geometry, speeds, rate, startdate)
    } else if(f.type == "LineString") {
        const ls = f.coordinates    // coordinates of linestring
        var time = 0                // ticker
        var newls = []              // coordinates of new linestring
        var lsidx = 0               // index in linestring

        var speeds = []

        if(! Array.isArray(speedsAtVertices)) {
          speeds[ls.length-1] = speedsAtVertices
        } else {
            speedsAtVertices.forEach(function(sp) {
                if(sp.idx < ls.length)
                    speeds[sp.idx] = sp.speed
            })
        }
        fillSpeed(speeds, ls.length)     // init speed array
        eta(ls, speeds)

        var maxstep = speed * rate / 3600
        var currpos = ls[lsidx]     // start pos
        emit(newls, time, currpos, 's', startdate, points, speeds[0], "start") // emit it
        var timeleft2vtx = 0  // time to next point
        var to_next_emit = rate

        while (lsidx < ls.length - 1) { // note: currpos is between ls[lsidx] and ls[lsidx+1]
            var nextvtx = ls[lsidx + 1] // next point (local target)
            timeleft2vtx = time2vtx(currpos, lsidx, ls, speeds, rate)  // time to next point
            debug(timeleft2vtx + " sec to next vertex",rate,to_next_emit)
            stop++

            if( (to_next_emit < rate) && (to_next_emit > 0) && (timeleft2vtx > to_next_emit) ) {     // If next vertex far away, we move during to_next_emit on edge and emit
                debug("moving from vertex with time remaining.. ("+stop+")", nextvtx, to_next_emit, timeleft2vtx)   // if we are here, we know we will not reach the next vertex
                time += to_next_emit                                                                 // during this to_next_emit time 
                p = point_in_rate_sec(currpos, rate, lsidx, ls, speeds, maxstep)
                emit(newls, time, p, 'e', startdate, points, get_speed(p, lsidx, ls, speeds), "moving from vertex with time remaining ("+lsidx+")")
                var d0 = distance(currpos,p)
                //debug("..done moving from vertex with time remaining. Moved ", d0+" in "+to_next_emit+" secs.", rate + " sec left before next emit, NOT jumping to next vertex")
                currpos = p
                to_next_emit = rate // time left before next emit
            }

            if( (to_next_emit < rate) && (to_next_emit > 0) && (timeleft2vtx < to_next_emit) ) {     // may be portion of segment left
                debug("moving to next vertex with time left.. ("+stop+")", nextvtx, to_next_emit, timeleft2vtx)
                time += timeleft2vtx
                emit(newls, time, nextvtx, (lsidx == (ls.length - 2)) ? 'f' : 'v'+(lsidx+1), startdate, points, speeds[lsidx+1], "moving on edge with time remaining ("+lsidx+")") // vertex
                currpos = nextvtx
                to_next_emit -= timeleft2vtx // time left before next emit
                //debug("..done moving to next vertex with time left.", to_next_emit + " sec left before next emit, moving to next vertex")
            } else {
                while (rate < timeleft2vtx) {   // we will report position(s) before reaching the vertice
                    debug("moving on edge.. ("+stop+")", rate, timeleft2vtx)
                    time += rate
                    p = point_in_rate_sec(currpos, rate, lsidx, ls, speeds, maxstep)
                    debug("in "+ rate + " sec moved",distance(currpos,p)+" km")
                    emit(newls, time, p, 'e', startdate, points, get_speed(p, lsidx, ls, speeds), "en route("+lsidx+")")
                    currpos = p
                    timeleft2vtx = time2vtx(currpos, lsidx, ls, speeds, rate)
                    //debug("..done moving on edge", rate, timeleft2vtx)

                    //if(stop++ == 4) return
                }

                if (timeleft2vtx > 0) {     // may be portion of segment left
                    var d0 = distance(currpos,nextvtx)
                    debug("jumping to next vertex.. ("+stop+")", nextvtx, d0+" km", timeleft2vtx+" secs")
                    time += timeleft2vtx
                    emit(newls, time, nextvtx, (lsidx == (ls.length - 2)) ? 'f' : 'v'+(lsidx+1), startdate, points, speeds[lsidx+1], (lsidx == (ls.length - 2)) ? "at last vertex("+lsidx+")" : "at vertex("+lsidx+")") // vertex
                    currpos = nextvtx
                    to_next_emit = rate - timeleft2vtx // time left before next emit
                    //debug(".. done jumping to next vertex.", to_next_emit + " sec left before next emit")
                }
            }

            lsidx += 1
        }
        f.coordinates = newls
        console.log("new ls:"+newls.length)
    }
    depth--
    return f
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
const jsonstring = fs.readFileSync(program.file, 'utf8')

const rate = parseInt(program.rate) // s
var speed = parseInt(program.speed) // km/h
var startdate = moment(program.startDate)
debug('date:'+startdate.isValid())

var fc = spit(JSON.parse(jsonstring), speed, rate, startdate)

fs.writeFileSync('out.json', JSON.stringify(fc), { mode: 0o644 })
console.log('out.json written')

if(program.zigzag) {
    fs.writeFileSync('zigzag.json', JSON.stringify(zigzag([5,50.6],10,4)), { mode: 0o644 })
    console.log('zigzag.json written')
}


