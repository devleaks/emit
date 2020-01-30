const fs = require('fs')
const moment = require('moment')
var program = require('commander')

const geoutils = require('./geoutils')
const debug = require('./debug.js')

debug.init(true, [""], "main")

program
    .version('1.1.0')
    .description('replaces all linestrings in geojson file with timed linestrings (best run one LS at a time)')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .requiredOption('-s, --speed <speed>', 'Speed of vehicle in km/h')
    .option('-r, --rate <rate>', 'Rate of event report in seconds, default 30 s', 30)
    .option('--start-date <date>', 'Start date of event reporting, default to now', moment().toISOString())
    .option('--shift-date <seconds>', 'Event reporting is shifted by that amount of seconds', moment().toISOString())
    .option('-s, --silent', 'Does not report position when stopped')
    .option('-n, --name <name>', 'Set reporting device name on output')
    .option('--min-speed <speed>', 'Minimum speed for objects (km/h)', 5)
    .option('-v, --vertices', 'Emit event at vertices (change of direction)')
    .option('-l, --last-point', 'Emit event at last point of line string, even if time rate is not elapsed')
    .parse(process.argv)

debug.init(program.debug, [""], "main")
debug.print(program.opts())


function distance(p1, p2) {
    return geoutils.distance(p1[1], p1[0], p2[1], p2[0], 'K')
}


function point_on_line(c, n, d) {
    var brng = geoutils.bearing(c[1], c[0], n[1], n[0])
    return geoutils.destVincenty(c[1], c[0], brng, 1000 * d) // distance must be in meter
}


function get_speed(currpos, lsidx, ls, speeds) { // linear acceleration
    var totald = distance(ls[lsidx], ls[lsidx + 1])
    var s = 0
    if (totald == 0) {
        s = speeds[lsidx + 1]
    } else {
        var partiald = distance(ls[lsidx], currpos)
        var portion = partiald / totald
        s = speeds[lsidx] + portion * (speeds[lsidx + 1] - speeds[lsidx])
    }
    return s
}


// we're at currpos, heading to nextvtx
// we move rate seconds in that direction
// returns where we land after rate seconds
function point_in_rate_sec(currpos, rate, lsidx, ls, speeds) {
    // We are at currpos, between ls[lsidx] and ls[lsidx+1]. We go towards ls[idx+1] for rate seconds.
    // 1. What is the speed at currpos. We assume linear accelleration.
    var totald = distance(ls[lsidx], ls[lsidx + 1])
    var partiald = distance(ls[lsidx], currpos)
    var leftd = totald - partiald // leftd = distance(currpos, ls[lsidx+1])
    var portion = partiald / totald
    var v0 = speeds[lsidx] + portion * (speeds[lsidx + 1] - speeds[lsidx])
    v0 = v0 < program.minSpeed ? program.minSpeed : v0
    var v1 = speeds[lsidx + 1] // should be >= program.minSpeed by design...
    var acc = (speeds[lsidx + 1] * speeds[lsidx + 1] - speeds[lsidx] * speeds[lsidx]) / (2 * totald) // a=(u²-v²)/2d

    // 2. Given the speedatcurrpos and speeds[idx+1] at ls[idx+1] how far do we travel duing rate seconds?
    var hourrate = rate / 3600
    var dist = v0 * hourrate + acc * hourrate * hourrate / 2

    var nextpos = point_on_line(currpos, ls[lsidx + 1], dist)

    debug.print({
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
        "rate": rate,
        "rate/h": rate/3600,
        "dist": dist,
        "ctr dist": distance(currpos, nextpos),
        "leftvtx": distance(nextpos,ls[lsidx+1])
     })

    return nextpos
}


function emit(newls, t, p, s, sd, pts, spd, cmt, idx) { //s=(s)tart, (e)dge, (v)ertex, (f)inish
    var k = s.charAt(0)
    if (   (k == 's' || k == 'e')                   // normal emit
        || (k == 'w' && !program.silent)            // stopped. does not emit if silent
        || (k == 'v' && program.vertices)           // at vertice, only emit if requested
        || (k == 'f' && program.lastPoint)  ) {     // at last point, only emit if requested

        var newt = program.shiftDate ? t + parseInt(program.shiftDate) : t

        if (sd && sd.isValid()) {
            dt = moment(sd).add(newt, 's').toISOString(true)
        }

        var color = "#888888"
        switch (k) {
            case 's':
                color = "#eeeeee"
                break
            case 'e':
                color = "#ff2600"
                break
            case 'v':
                color = "#fffc00"
                break
            case 'f':
                color = "#111111"
                break
            case 'w':
                color = "#00fa00"
                break
            default:
                color = "#888888"
        }


        var brng = (newls.length > 0) ? geoutils.bearing(newls[(newls.length-1)][1], newls[(newls.length-1)][0], p[1], p[0]) : null
        brng = Math.round(brng * 10) / 10
        debug.print(k, idx, newls[idx], p, brng)

        newls.push([p[0], p[1]])
        pts.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": p
            },
            "properties": {
                "emit": true,
                "marker-color": color,
                "marker-size": "medium",
                "marker-symbol": "",
                "timestamp": dt,
                "elapsed": t,
                "vertex": idx,
                "sequence": pts.length,
                "speed": spd,
                "bearing": brng,
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
        if (from == (max - 1)) {
            return from
        }
        var i = from + 1
        while (i < (max - 1) && typeof(arr[i]) == "undefined")
            i++
        return i
    }

    if (typeof(a[0]) == "undefined")
        a[0] = dft < minSpeed ? minSpeed : dft

    for (var i = 1; i < len; i++) {
        if (typeof(a[i]) == "undefined") {
            var j = nexta(a, i, len)
            if ((j == len - 1) && (typeof(a[j]) == "undefined")) { // no last value, stay at constant speed
                for (var k = i; k < len; k++) {
                    a[k] = a[k - 1]
                }
            } else { // change speed to next supplied value
                var d = a[j] < minSpeed ? minSpeed : a[j] // target value
                var s = (d - a[i - 1]) / (j - i + 1) // slope
                for (var k = i; k <= j; k++) {
                    a[k] = a[i - 1] + s * (k - i + 1)
                }
            }
            i = j
        } else {
            a[i] = a[i] < minSpeed ? minSpeed : a[i]
        } // else a is set
    }
} //@@todomust check that there are no 2 speeds=0 following each other with d>0


function sec2hms(i) {
    totalSeconds = Math.round(i * 3600)
    hours = Math.floor(totalSeconds / 3600)
    totalSeconds %= 3600
    minutes = Math.floor(totalSeconds / 60)
    seconds = totalSeconds % 60
    minutes = String(minutes).padStart(2, "0")
    hours = String(hours).padStart(2, "0")
    seconds = String(seconds).padStart(2, "0")
    var msec = Math.round(totalSeconds * 1000) / 1000
    return hours + ":" + minutes + ":" + seconds // + "." + msec
}

function eta(ls, speed) {
    var eta = []
    eta[0] = 0
    //debug.print(speed)
    debug.print("v0", 0, speed[0], speed[0], 0, "00:00:00", "00:00:00")
    for (var i = 1; i < speed.length; i++) {
        var t = 0
        var d = distance(ls[i - 1], ls[i])
        if (speed[i - 1] != speed[i]) {
            t = 2 * d / Math.abs(speed[i] + speed[i - 1]) // acceleration is uniform, so average speed is OK for segment.
        } else {
            t = d / Math.max(speed[i - 1], speed[i])
        }
        eta[i] = eta[i - 1] + t
        debug.print("v" + i, Math.round(1000 * d) / 1000, speed[i - 1], speed[i], Math.round(3600000 * t) / 1000, sec2hms(t, 2), sec2hms(eta[i], 2))
    }
    return eta
}

function time2vtx(p, idx, ls, sp, rate) {
    var d = distance(p, ls[idx + 1])
    var d0 = distance(ls[idx], p)
    var de = distance(ls[idx], ls[idx + 1])
    var vp = 0
    if (d0 == 0)
        vp = sp[idx]
    else if (d == 0)
        vp = sp[idx + 1]
    else
        vp = sp[idx] + (d0 / de) * (sp[idx + 1] - sp[idx]) // speed at point, if linear acceleration

    vp = vp < program.minSpeed ? program.minSpeed : vp

    debug.print('time2vtx ', d, de, sp[idx], sp[idx + 1], vp)

    var t = 0
    if ((vp + sp[idx + 1]) != 0)
        t = 2 * d / (vp + sp[idx + 1]) // again, we assume constant acceleration so avg speed is fine

    var r = Math.round(t * 3600000) / 1000
    debug.print('>>> TO', idx + 1, d + " km left", r + " secs needed")

    /* control */
    p1 = point_in_rate_sec(p, rate, idx, ls, sp)
    d1 = distance(p1, ls[idx+1])
    p2 = point_in_rate_sec(p, r, idx, ls, sp)
    d2 = distance(p2, ls[idx+1])
    d3 = distance(p,p1)
    d4 = distance(p,p2)
    debug.print("CONTROL", {
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
    return "(" + Math.round(p[1] * r) / r + ',' + Math.round(p[0] * r) / r + ")"
}

function rn(p, n = 4) {
    r = Math.pow(10, n)
    return Math.round(p * r) / r
}


function pauseAtVertex(timing, pause, rate, newls, pos, lsidx, lsmax, startdate, points, speeds) {
    debug.print("IN", lsidx, timing)
    var counter = 0
    if (pause && pause > 0) {
        debug.print("must pause", pause)
        if (pause < rate) {
            if (pause > timing.left) { // will emit here
                emit(newls, timing.time + timing.left, pos, 'w', startdate, points, speeds[lsidx + 1], (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter, lsidx) // vertex
                counter++
                debug.print("pauseing 1 ...", pause)
                // keep wating but no emit since pause < rate
                timing.time += pause
                timing.left = rate - pause - timing.left
            } else { // will not emit here, we just pause and then continue our trip
                debug.print("pauseed 1 but carries on", pause)
                timing.time += pause
                timing.left -= pause
            }
        } else { // will emit here, may be more than once. let's first emit once on left
            emit(newls, timing.time + timing.left, pos, 'w', startdate, points, speeds[lsidx + 1], (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter, lsidx) // vertex
            counter++
            debug.print("pauseing 2 ...", timing.left)
            timing.time += timing.left

            var totpause = pause - timing.left
            // then let's emit as many time as we pause
            while (totpause > 0) {
                timing.time += rate
                emit(newls, timing.time, pos, 'w', startdate, points, speeds[lsidx + 1], (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter, lsidx) // vertex
                counter++
                debug.print("pauseing 3 ...", totpause)
                totpause -= rate
            }
            // then set time to next emit
            timing.left = totpause + rate
        }
    }
    timing.counter = counter
    debug.print("OUT", timing)
    return timing
}

/** MAIN **/
function doGeoJSON(f, speed, rate, startdate) {
    if (f.type == "FeatureCollection") {
        return doCollection(f, speed, rate, startdate)
    } else if (f.type == "Feature") {
        if (f.geometry && f.geometry.type == "LineString") { // feature can omot geometry
            var fret = doLineStringFeature(f, speed, rate, startdate)
            if (fret.points && fret.points.length > 0) { // add points of emission if requested (-p option)
                var fc = {
                    type: "FeatureCollection",
                    features: []
                }
                fc.features.push(fret.feature)
                fc.features = f.features.concat(points)
                return fc
            } else
                return fret.feature
        }
    } else if (f.type == "LineString") {
        var fret = doLineStringFeature({
            "type": "Feature",
            "geometry": f
        }, speed, rate, startdate)
        return fret.feature.geometry
    }
    return false // f is no geojson?
}

function doCollection(fc, speed, rate, startdate) {
    fc.features.forEach(function(f, idx) {
        if(f.geometry && f.geometry.type == "LineString") {
            var fret = doLineStringFeature(f, speed, rate, startdate)
            if (fret.feature)
                fc.features[idx] = fret.feature
            if (fret.points && fret.points.length > 0) { // add points of emission if requested (-p option)
                fc.features = fc.features.concat(fret.points)
            }
        }
    })
    return fc
}

function doLineStringFeature(f, speed, rate, startdates) {
    var speedsAtVertices = (f.properties && f.properties.speedsAtVertices) ? f.properties.speedsAtVertices : null
    var pausesAtVertices = (f.properties && f.properties.pausesAtVertices) ? f.properties.pausesAtVertices : null
    const ls = f.geometry.coordinates // linestring
    var lsidx = 0 // index in linestring
    var newls = [] // coordinates of new linestring
    var time = 0 // ticker
    var points = [] // points where broacasting position

    var speeds = []
    var pauses = []

    if (Array.isArray(speedsAtVertices)) {
        speedsAtVertices.forEach(function(sp) {
            if (sp.idx < ls.length)
                speeds[sp.idx] = sp.speed
        })
    } else {
        speeds[ls.length - 1] = speed
    }
    fillSpeed(speeds, ls.length) // init speed array
    eta(ls, speeds)

    if (Array.isArray(pausesAtVertices)) {
        pausesAtVertices.forEach(function(wt) {
            if (wt.idx < ls.length)
                pauses[wt.idx] = wt.pause
        })
    }

    debug.print("arrays:" + ls.length + ":" + speeds.length + ":" + pauses.length)

    var maxstep = speed * rate / 3600
    var currpos = ls[lsidx] // start pos
    emit(newls, time, currpos, 's', startdate, points, speeds[0], "start", lsidx) // emit it
    var timeleft2vtx = 0 // time to next point
    var to_next_emit = rate

    while (lsidx < ls.length - 1) { // note: currpos is between ls[lsidx] and ls[lsidx+1]
        var nextvtx = ls[lsidx + 1] // next point (local target)
        timeleft2vtx = time2vtx(currpos, lsidx, ls, speeds, rate) // time to next point
        debug.print(timeleft2vtx + " sec to next vertex", rate, to_next_emit)

        if ((to_next_emit > 0) && (to_next_emit < rate) && (timeleft2vtx > to_next_emit)) { // If next vertex far away, we move during to_next_emit on edge and emit
            debug.print("moving from vertex with time remaining.. (" + lsidx + ")", nextvtx, to_next_emit, timeleft2vtx) // if we are here, we know we will not reach the next vertex
            time += to_next_emit // during this to_next_emit time 
            p = point_in_rate_sec(currpos, to_next_emit, lsidx, ls, speeds, maxstep)
            emit(newls, time, p, 'e', startdate, points, get_speed(p, lsidx, ls, speeds), "moving from vertex with time remaining", lsidx)
            //var d0 = distance(currpos,p)
            //debug.print("..done moving from vertex with time remaining. Moved ", d0+" in "+to_next_emit+" secs.", rate + " sec left before next emit, NOT jumping to next vertex")
            currpos = p
            to_next_emit = rate // time before next emit reset to standard rate
        }

        if ((to_next_emit < rate) && (to_next_emit > 0) && (timeleft2vtx < to_next_emit)) { // may be portion of segment left
            debug.print("moving to next vertex with time left.. (" + lsidx + ")", nextvtx, to_next_emit, timeleft2vtx)
            time += timeleft2vtx
            emit(newls, time, nextvtx, (lsidx == (ls.length - 2)) ? 'f' : 'v' + (lsidx + 1), startdate, points, speeds[lsidx + 1], "moving on edge with time remaining to next vertex", lsidx)
            currpos = nextvtx
            to_next_emit -= timeleft2vtx // time left before next emit
            // pauseAtVertex(timing, pause, rate, newls, pos, lsidx, lsmax, startdate, points, speeds)
            var timing = pauseAtVertex({ "time": time, "left": to_next_emit }, pauses[lsidx + 1] ? pauses[lsidx + 1] : null, rate, newls, nextvtx, lsidx + 1, ls.length, startdate, points, speeds)
            time = timing.time
            to_next_emit = timing.left
            //debug.print("..done moving to next vertex with time left.", to_next_emit + " sec left before next emit, moving to next vertex")
        } else {
            while (rate < timeleft2vtx) { // we will report position(s) along the edge before reaching the vertex
                debug.print("moving on edge..", rate, timeleft2vtx)
                time += rate
                p = point_in_rate_sec(currpos, rate, lsidx, ls, speeds, maxstep)
                emit(newls, time, p, 'e', startdate, points, get_speed(p, lsidx, ls, speeds), "en route", lsidx)
                //debug.print("in "+ rate + " sec moved",distance(currpos,p)+" km")
                currpos = p
                timeleft2vtx = time2vtx(currpos, lsidx, ls, speeds, rate)
                //debug.print("..done moving on edge", rate, timeleft2vtx)
            }

            if (timeleft2vtx > 0) { // may be portion of segment left
                var d0 = distance(currpos, nextvtx)
                debug.print("jumping to next vertex..", nextvtx, d0 + " km", timeleft2vtx + " secs")
                time += timeleft2vtx
                emit(newls, time, nextvtx, (lsidx == (ls.length - 2)) ? 'f' : 'v' + (lsidx + 1), startdate, points, speeds[lsidx + 1], (lsidx == (ls.length - 2)) ? "at last vertex" : "at vertex", lsidx) // vertex
                currpos = nextvtx
                to_next_emit = rate - timeleft2vtx // time left before next emit
                // pauseAtVertex(timing, pause, rate, newls, pos, lsidx, lsmax, startdate, points, speeds)
                var timing = pauseAtVertex({ "time": time, "left": to_next_emit }, pauses[lsidx + 1] ? pauses[lsidx + 1] : null, rate, newls, nextvtx, lsidx + 1, ls.length, startdate, points, speeds)
                time = timing.time
                to_next_emit = timing.left
                //debug.print(".. done jumping to next vertex.", to_next_emit + " sec left before next emit")
            }
        }

        lsidx += 1
    }
    f.geometry.coordinates = newls
    // they are no longer valid:
    if(f.properties.hasOwnProperty("speedsAtVertices"))
        delete(f.properties.speedsAtVertices)
    if(f.properties.hasOwnProperty("pausesAtVertices"))
        delete(f.properties.pausesAtVertices)
    debug.print("new ls length", newls.length)
    return { "feature": f, "points": points }
}

/* MAIN
 */
const jsonstring = fs.readFileSync(program.file, 'utf8')
const rate = parseInt(program.rate) // s
const speed = parseInt(program.speed) // km/h
const startdate = moment(program.startDate)

if(!startdate.isValid()) {
    debug.print('start date is not valid',startdate)
    return false
}

const fc = doGeoJSON(JSON.parse(jsonstring), speed, rate, startdate)
fs.writeFileSync(program.O, JSON.stringify(fc), { mode: 0o644 })
console.log(program.O + ' written')

