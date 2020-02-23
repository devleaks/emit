const turf = require('@turf/turf')

const geojson = require('../lib/geojson-util')
const debug = require('../lib/debug')

function point_on_line(c, n, d) {
    var brng = turf.bearing(c, n)
    const p = turf.destination(c, d, brng)
    return p.geometry.coordinates
}

/*  Add jitter around point, random direction, random distance between 0 and r (meters)
 *  @todo: Jitter 3D
 */
function jitter(p, r = 0) {
    if (!r || r == 0) return p
    const j = turf.destination(p, Math.random() * r / 1000, Math.random() * 360)
    return j.geometry.coordinates
}

function get_speed(currpos, lsidx, ls, speeds) { // linear acceleration
    var totald = turf.distance(ls[lsidx], ls[lsidx + 1])
    var s = 0
    if (totald == 0) {
        s = speeds[lsidx + 1]
    } else {
        var partiald = turf.distance(ls[lsidx], currpos)
        var portion = partiald / totald
        s = speeds[lsidx] + portion * (speeds[lsidx + 1] - speeds[lsidx])
    }
    return s
}


// we're at currpos, heading to nextvtx
// we move rate seconds in that direction
// returns where we land after rate seconds
function point_in_rate_sec(options, currpos, rate, lsidx, ls, speeds) {
    // We are at currpos, between ls[lsidx] and ls[lsidx+1]. We go towards ls[idx+1] for rate seconds.
    // 1. What is the speed at currpos. We assume linear accelleration.
    var totald = turf.distance(ls[lsidx], ls[lsidx + 1])

    if (totald == 0)
        return ls[lsidx + 1]

    var partiald = turf.distance(ls[lsidx], currpos)
    var leftd = totald - partiald // leftd = turf.distance(currpos, ls[lsidx+1])
    var portion = partiald / totald
    var v0 = speeds[lsidx] + portion * (speeds[lsidx + 1] - speeds[lsidx])
    v0 = v0 < options.minSpeed ? options.minSpeed : v0
    var v1 = speeds[lsidx + 1] // should be >= options.minSpeed by design...
    var acc = (speeds[lsidx + 1] * speeds[lsidx + 1] - speeds[lsidx] * speeds[lsidx]) / (2 * totald) // a=(u²-v²)/2d

    // 2. Given the speedatcurrpos and speeds[idx+1] at ls[idx+1] how far do we travel duing rate seconds?
    var hourrate = rate / 3600
    var dist = v0 * hourrate + acc * hourrate * hourrate / 2

    var nextpos = point_on_line(currpos, ls[lsidx + 1], dist)

    debug.print({
        "prevvtx": geojson.ll(ls[lsidx]),
        "startp": geojson.ll(currpos),
        "nextvtx": geojson.ll(ls[lsidx + 1]),
        "nextpos": geojson.ll(nextpos),
        "totald": totald,
        "covered": partiald,
        "lefd": leftd,
        "prevspeed": speeds[lsidx],
        "nextspeed": speeds[lsidx + 1],
        "currspeed": v0,
        "accel": acc,
        "rate": rate,
        "rate/h": rate / 3600,
        "dist": dist,
        "ctr dist": turf.distance(currpos, nextpos),
        "leftvtx": turf.distance(nextpos, ls[lsidx + 1])
    })

    return nextpos
}

/*  Get extra properties to attach to emited event
 */
function getClosestProps(options, lsidx) {
    if(!options.hasOwnProperty("_markers"))
        return {} // no markers, no prop!
    // find closest maker
    var marker = false
    var cnt = lsidx
    while(!marker && cnt >= 0) { // search for marker whose index is just before the current index
        marker = geojson.findFeature(cnt,options._markers,"idx")
        cnt--
    }
    debug.print(marker ? marker.properties.idx : 'marker not found', lsidx)
    return marker ? marker.properties : {}
}

// BEFORE emit(options, newls, t, p, s, pts, spd, cmt, idx, alt = false, props = {}) { //s=(s)tart, (e)dge, (v)ertex, (f)inish
/* NOW
emit({
    options: options,
    newls: newls,
    t: timing.time + timing.left,
    p: pos,
    s: 'w',
    pts: points,
    spd: 0,
    cmt: (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter,
    idx: lsidx,
    alt: false,
    props: {}
})
*/
function emit(args) { //s=(s)tart, (e)dge, (v)ertex, (f)inish
    var k = args.s.charAt(0)
    if ((k == 's' || k == 'e') // normal emit
        ||
        (k == 'w' && !args.options.silent) // stopped. does not emit if silent
        ||
        (k == 'v' && args.options.vertices) // at vertice, only emit if requested
        ||
        (k == 'f' && args.options.lastPoint)) { // at last point, only emit if requested

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


        var brng = (args.newls.length > 0) ? turf.bearing(args.newls[args.newls.length - 1], args.p) : 0

        if (args.pts.length == 1) { // retro add bearing of first element
            args.pts[0].properties.bearing = Math.round(turf.bearing(args.newls[0], args.p) * 10) / 10
        }

        if (brng < 0) brng += 360
        brng = Math.round(brng * 10) / 10
        debug.print(k, args.idx, args.newls[args.idx], args.p, brng)

        const jp = jitter(args.p, args.options.jitter)

        if (args.options.altitude && args.alt) {
            args.newls.push([jp[0], jp[1], alt])
        } else {
            args.newls.push([jp[0], jp[1]])
        }

        var properties = geojson.mergeProperties({
            "emit": true,
            "marker-color": color,
            "marker-size": "medium",
            "marker-symbol": "",
            "nojitter": args.p,
            "elapsed": args.t,
            "vertex": args.idx,
            "sequence": args.pts.length,
            "speed": args.spd,
            "bearing": brng,
            "note": args.cmt
        }, args.props)
        var xtraprops = getClosestProps(args.options, args.idx)
        properties = geojson.mergeProperties(properties, xtraprops)

        args.pts.push(geojson.Feature(geojson.Point(jp), properties))
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
    fillValues(a, len, parseFloat(options.minSpeed), parseFloat(options.speed))
} //@@todomust check that there are no 2 speeds=0 following each other with d>0


// From a table (vertex index,altitude or gradient at that vertex) for some vertex only,
// we build a simple table (vertex index, altitude at vertex) for all vertices.
// If no altitude is given, ground level is assumed.
// Altitude is spedicifed by a couple (altitude-type, altitude) where altitude type is
// MSL (above (Mean) Sea Level)
// AGL (Above Ground Level)
// BAR (Aircraft Barometric Altitude)
// Note: GeoJSON requires altitude in meter either "with z expressed as metres above mean sea level per WGS84" or "SHALL be the height in meters above the WGS 84 reference ellipsoid"
// Well, for use its either above (airport) ground level, or above mean sea level, whereever level 0 migth be...
// Note that an aircraft's ADS-B transmission broadcasts its "barometric altitude". Oh boy. 
function fillValues(a, len, minval = 0, dftval = 0) {
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
        a[0] = dftval < minval ? minval : dftval

    for (var i = 1; i < len; i++) {
        if (typeof(a[i]) == "undefined") {
            var j = nexta(a, i, len)
            if ((j == len - 1) && (typeof(a[j]) == "undefined")) { // no last value, stay at constant speed
                for (var k = i; k < len; k++) {
                    a[k] = a[k - 1]
                }
            } else { // change speed to next supplied value
                var d = a[j] < minval ? minval : a[j] // target value
                var s = (d - a[i - 1]) / (j - i + 1) // slope
                for (var k = i; k <= j; k++) {
                    a[k] = a[i - 1] + s * (k - i + 1)
                }
            }
            i = j
        } else {
            a[i] = a[i] < minval ? minval : a[i]
        } // else a is set
    }
} //@@todomust check that there are no 2 speeds=0 following each other with d>0

// Shortcut:
// From a table (vertex index,speed at that vertex) for some vertex only,
// we build a simple table (vertex index, speed at vertex) for all vertices
// we also get a table (vertex index, time at that vertext).
function fillSpeed(a, len, minval = 0, dftval = 0) {
    fillValues(a, len, minval, dftval)
}

/*  Altitude functions
 *
 */
function fillAltitude(a, len) {
    fillValues(a, len, 0, 0)
}

function get_altitude(p, idx, ls, alt) { // linear interpolation
    var d0 = turf.distance(ls[idx], p)
    var d1 = turf.distance(ls[idx], ls[idx + 1]) // note: if d1 == 0 alt[idx].alt should equal alt[idx+1].alt
    return d1 == 0 ? alt[idx].alt : alt[idx].alt + (alt[idx + 1].alt - alt[idx].alt) * d0 / d1
}

// Return altitude MSL
function altitudeMSL(altdef, ground = 0) {
    return altdef.type == "MSL" ? altdef.alt : ground + altdef.alt
}

// nice display of seconds
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
        var d = turf.distance(ls[i - 1], ls[i])
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

function time2vtx(options, p, idx, ls, sp, rate) {
    var d = turf.distance(p, ls[idx + 1])
    var d0 = turf.distance(ls[idx], p)
    var de = turf.distance(ls[idx], ls[idx + 1])
    var vp = 0
    if (d0 == 0)
        vp = sp[idx]
    else if (d == 0)
        vp = sp[idx + 1]
    else
        vp = sp[idx] + (d0 / de) * (sp[idx + 1] - sp[idx]) // speed at point, if linear acceleration

    vp = vp < options.minSpeed ? options.minSpeed : vp

    debug.print('time2vtx ', d, de, sp[idx], sp[idx + 1], vp)

    var t = 0
    if ((vp + sp[idx + 1]) != 0)
        t = 2 * d / (vp + sp[idx + 1]) // again, we assume constant acceleration so avg speed is fine

    var r = Math.round(t * 3600000) / 1000
    debug.print('>>> TO', idx + 1, d + " km left", r + " secs needed")

    /* control */
    p1 = point_in_rate_sec(options, p, rate, idx, ls, sp)
    d1 = turf.distance(p1, ls[idx + 1])
    p2 = point_in_rate_sec(options, p, r, idx, ls, sp)
    d2 = turf.distance(p2, ls[idx + 1])
    d3 = turf.distance(p, p1)
    d4 = turf.distance(p, p2)
    debug.print("CONTROL", {
        "index": idx,
        "d2next": d,
        "dfprev": d0,
        "dtot": de,
        "v0": sp[idx],
        "v1": sp[idx + 1],
        "vp": vp,
        "time2vtx": r,
        "control:d2next(rate)": d1,
        "control:d2next(time2vtx)": d2,
        "control:d3travel(rate)": d3,
        "control:d4travel(time2vtx)": d4
    })

    return r
}


/* When on pause, forces speed to 0
 */
function pauseAtVertex(options, timing, pause, rate, newls, pos, lsidx, lsmax, points, speeds) {
    debug.print("IN", lsidx, timing)
    var counter = 0
    if (pause && pause > 0) {
        debug.print("must pause", pause)
        if (pause < rate) {
            if (pause > timing.left) { // will emit here
                emit({
                    options: options,
                    newls: newls,
                    t: timing.time + timing.left,
                    p: pos,
                    s: 'w',
                    pts: points,
                    spd: 0,
                    cmt: (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter,
                    idx: lsidx,
                    alt: false,
                    props: {}
                })
                counter++
                debug.print("pauseing 1 ...", pause)
                // keep wating but no emit since pause < rate
                timing.time += pause
                timing.left = rate - pause - timing.left
            } else { // will not emit here, we just pause and then continue our trip
                debug.print("paused but carries on", pause)
                timing.time += pause
                timing.left -= pause
            }
        } else { // will emit here, may be more than once. let's first emit once on time left
            emit({
                options: options,
                newls: newls,
                t: timing.time + timing.left,
                p: pos,
                s: 'w',
                pts: points,
                spd: 0,
                cmt: (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter,
                idx: lsidx,
                alt: false,
                props: {}
            })
            counter++
            debug.print("pauseing 2 ...", timing.left)
            timing.time += timing.left

            var totpause = pause - timing.left
            // then let's emit as many time as we pause
            while (totpause > 0) {
                timing.time += rate
                emit({
                    options: options,
                    newls: newls,
                    t: timing.time,
                    p: pos,
                    s: 'w',
                    pts: points,
                    spd: 0,
                    cmt: (lsidx == (lsmax - 1)) ? "at last vertex while pauseing " + counter : "at vertex while pauseing " + counter,
                    idx: lsidx,
                    alt: false,
                    props: {}
                })
                counter++
                debug.print("pauseing more ...", totpause)
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
exports.emitGeoJSON = function(f, options) {
    if(!f.hasOwnProperty("type")) {
        debug.error("no type. Not GeoJSON?")
        return false
    }
    if (f.type == "FeatureCollection") {
        return exports.emitCollection(f, options)
    } else if (f.type == "Feature") {
        if (f.geometry && f.geometry.type == "LineString") { // feature can omot geometry
            var fret = doLineStringFeature(f, speed, rate)
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
        }, speed, rate)
        return fret.feature.geometry
    }
    return false // f is no geojson?
}


exports.emitCollection = function(fc, options) {
    var markers = []
    fc.features.forEach(function(f, idx) {
        if (  (f.geometry && f.geometry.type == "Point")
           && (f.properties && f.properties.hasOwnProperty("marker") && f.properties.marker) ) {
            if(f.properties.hasOwnProperty("nearestPointOnLine")) delete f.properties.nearestPointOnLine
            markers.push(f)
        }
    })
    options._markers = geojson.FeatureCollection(markers)
    fc.features.forEach(function(f, idx) {
        if (f.geometry && f.geometry.type == "LineString") {
            var fret = exports.emitLineStringFeature(f, options)
            if (fret.feature)
                fc.features[idx] = fret.feature
            if (fret.points && fret.points.length > 0) { // add points of emission if requested (-p option)
                fc.features = fc.features.concat(fret.points)
            }
        }
    })
    return fc
}


exports.emitLineStringFeature = function(f, options) {
    var speedsAtVertices = (f.hasOwnProperty("properties") && f.properties.hasOwnProperty("speedsAtVertices")) ? f.properties.speedsAtVertices : null
    var pausesAtVertices = (f.hasOwnProperty("properties") && f.properties.hasOwnProperty("pausesAtVertices")) ? f.properties.pausesAtVertices : null
    var altAtVertices = (f.hasOwnProperty("properties") && f.properties.hasOwnProperty("altAtVertices")) ? f.properties.altAtVertices : null
    const ls = f.geometry.coordinates // linestring
    var lsidx = 0 // index in linestring
    var newls = [] // coordinates of new linestring
    var time = 0 // ticker
    var points = [] // points where broacasting position

    var speeds = []
    var pauses = []
    var alt = []

    const speed = parseFloat(options.speed)
    const rate = parseFloat(options.rate)

    if (Array.isArray(speedsAtVertices)) {
        speedsAtVertices.forEach(function(sp) {
            if (sp.idx < ls.length)
                speeds[sp.idx] = sp.speed
        })
    } else {
        speeds[ls.length - 1] = speed
    }
    fillSpeed(speeds, ls.length, parseFloat(options.minSpeed), speed) // init speed array
    eta(ls, speeds)

    if (Array.isArray(pausesAtVertices)) {
        pausesAtVertices.forEach(function(wt) {
            if (wt.idx < ls.length)
                pauses[wt.idx] = wt.pause
        })
    }

    if (options.altitude && Array.isArray(altAtVertices)) {
        altAtVertices.forEach(function(wt) {
            if (wt.idx < ls.length)
                alt[wt.idx] = wt.alt
        })
        fillAltitude(alt, ls.length) // init altitude array
        // place altitude on points
        ls.forEach(function(p, idx) {
            if (p.length == 2) { // has only 2 coord, so we add alt
                p[2] = alt[idx]
            }
        })
    }


    debug.print("arrays:" + ls.length + ":" + speeds.length + ":" + pauses.length + ":" + alt.length)

    var maxstep = speed * rate / 3600
    var currpos = ls[lsidx] // start pos
    emit({
        options: options,
        newls: newls,
        t: time,
        p: currpos,
        s: 's',
        pts: points,
        spd: speeds[0],
        cmt: "start",
        idx: lsidx,
        alt: false,
        props: {}
    })
    var timeleft2vtx = 0 // time to next point
    var to_next_emit = rate

    while (lsidx < ls.length - 1) { // note: currpos is between ls[lsidx] and ls[lsidx+1]
        var nextvtx = ls[lsidx + 1] // next point (local target)
        timeleft2vtx = time2vtx(options, currpos, lsidx, ls, speeds, rate) // time to next point
        debug.print(timeleft2vtx + " sec to next vertex", rate, to_next_emit)

        if ((to_next_emit > 0) && (to_next_emit < rate) && (timeleft2vtx > to_next_emit)) { // If next vertex far away, we move during to_next_emit on edge and emit
            debug.print("moving from vertex with time remaining.. (" + lsidx + ")", nextvtx, to_next_emit, timeleft2vtx) // if we are here, we know we will not reach the next vertex
            time += to_next_emit // during this to_next_emit time 
            p = point_in_rate_sec(options, currpos, to_next_emit, lsidx, ls, speeds, maxstep)
            emit({
                options: options,
                newls: newls,
                t: time,
                p: p,
                s: 'e',
                pts: points,
                spd: get_speed(p, lsidx, ls, speeds),
                cmt: "moving from vertex with time remaining",
                idx: lsidx,
                alt: false,
                props: {}
            })
            //var d0 = distance(currpos,p)
            //debug.print("..done moving from vertex with time remaining. Moved ", d0+" in "+to_next_emit+" secs.", rate + " sec left before next emit, NOT jumping to next vertex")
            currpos = p
            to_next_emit = rate // time before next emit reset to standard rate
            timeleft2vtx = time2vtx(options, currpos, lsidx, ls, speeds, rate) // time to next point
            debug.print(timeleft2vtx + " sec to next vertex (new eval)", rate, to_next_emit)
        }

        if ((to_next_emit < rate) && (to_next_emit > 0) && (timeleft2vtx < to_next_emit)) { // may be portion of segment left
            debug.print("moving to next vertex with time left.. (" + lsidx + ")", nextvtx, to_next_emit, timeleft2vtx)
            time += timeleft2vtx
            emit({
                options: options,
                newls: newls,
                t: time,
                p: nextvtx,
                s: (lsidx == (ls.length - 2)) ? 'f' : 'v' + (lsidx + 1),
                pts: points,
                spd: speeds[lsidx + 1],
                cmt: "moving on edge with time remaining to next vertex",
                idx: lsidx,
                alt: false,
                props: {}
            })
            currpos = nextvtx
            to_next_emit -= timeleft2vtx // time left before next emit
            // pauseAtVertex(timing, pause, rate, newls, pos, lsidx, lsmax, points, speeds)
            var timing = pauseAtVertex(options, { "time": time, "left": to_next_emit }, pauses[lsidx + 1] ? pauses[lsidx + 1] : null, rate, newls, nextvtx, lsidx + 1, ls.length, points, speeds)
            time = timing.time
            to_next_emit = timing.left
            //debug.print("..done moving to next vertex with time left.", to_next_emit + " sec left before next emit, moving to next vertex")
        } else {
            while (rate < timeleft2vtx) { // we will report position(s) along the edge before reaching the vertex
                debug.print("moving on edge..", rate, timeleft2vtx)
                time += rate
                p = point_in_rate_sec(options, currpos, rate, lsidx, ls, speeds, maxstep)
                emit({
                    options: options,
                    newls: newls,
                    t: time,
                    p: p,
                    s: 'e',
                    pts: points,
                    spd: get_speed(p, lsidx, ls, speeds),
                    cmt: "en route",
                    idx: lsidx,
                    alt: false,
                    props: {}
                })
                //debug.print("in "+ rate + " sec moved",distance(currpos,p)+" km")
                currpos = p
                timeleft2vtx = time2vtx(options, currpos, lsidx, ls, speeds, rate)
                //debug.print("..done moving on edge", rate, timeleft2vtx)
            }

            if (timeleft2vtx > 0) { // may be portion of segment left
                var d0 = turf.distance(currpos, nextvtx)
                debug.print("jumping to next vertex..", nextvtx, d0 + " km", timeleft2vtx + " secs")
                time += timeleft2vtx
                emit({
                    options: options,
                    newls: newls,
                    t: time,
                    p: nextvtx,
                    s: (lsidx == (ls.length - 2)) ? 'f' : 'v' + (lsidx + 1),
                    pts: points,
                    spd: speeds[lsidx + 1],
                    cmt: (lsidx == (ls.length - 2)) ? "at last vertex" : "at vertex",
                    idx: lsidx,
                    alt: false,
                    props: {}
                })
                currpos = nextvtx
                to_next_emit = rate - timeleft2vtx // time left before next emit
                // pauseAtVertex(timing, pause, rate, newls, pos, lsidx, lsmax, points, speeds)
                var timing = pauseAtVertex(options, { "time": time, "left": to_next_emit }, pauses[lsidx + 1] ? pauses[lsidx + 1] : null, rate, newls, nextvtx, lsidx + 1, ls.length, points, speeds)
                time = timing.time
                to_next_emit = timing.left
                //debug.print(".. done jumping to next vertex.", to_next_emit + " sec left before next emit")
            }
        }

        lsidx += 1
    }
    f.geometry.coordinates = newls
    // they are no longer valid:
    if (f.properties.hasOwnProperty("speedsAtVertices"))
        delete(f.properties.speedsAtVertices)
    if (f.properties.hasOwnProperty("pausesAtVertices"))
        delete(f.properties.pausesAtVertices)
    if (f.properties.hasOwnProperty("altsAtVertices"))
        delete(f.properties.altsAtVertices)
    debug.print("new ls length", newls.length)
    return { "feature": f, "points": points }
}