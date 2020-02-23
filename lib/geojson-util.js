const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')
const turf = require('@turf/turf')

const CACHE_NAME = "nearestPointOnLine"
const MLS_CACHE = "mls"

/* GeoJSON Utility and normalisation exports.*/
exports.Geometry = function(coords, type) {
    return {
        "type": type,
        "coordinates": coords
    }
}

/* avoid GeometryCollection */

exports.Point = function(coords) {
    return exports.Geometry(coords, "Point")
}

exports.MultiPoint = function(coords) {
    return exports.Geometry(coords, "MultiPoint")
}

exports.LineString = function(coords) {
    return exports.Geometry(coords, "LineString")
}

exports.MultiLineString = function(coords) {
    return exports.Geometry(coords, "MultiLineString")
}

exports.Polygon = function(coords) {
    return exports.Geometry(coords, "Polygon")
}

exports.MultiPolygon = function(coords) {
    return exports.Geometry(coords, "MultiPolygon")
}

exports.Feature = function(geom, props = false) {
    return {
        "type": "Feature",
        "geometry": geom,
        "properties": props ? props : {}
    }
}

exports.FeatureCollection = function(f, props = false) {
    return props ? {
        "type": "FeatureCollection",
        "features": f,
        "properties": props
    } : {
        "type": "FeatureCollection",
        "features": f
    }
}

/* not correct, a Feature can be without coordinate...
 */
exports.coords = function(f) {
    return (f.type == "Feature") ? f.geometry.coordinates : (f.coordinates ? f.coordinates : f)
}

// LatLon is lat,lon
exports.LatLon = function(lat, lon, alt = false) {
    return alt ? [lon, lat, alt] : [lon, lat]
}

// Position is GeoJSON standard lon,lat
exports.Position = function(lon, lat, alt = false) {
    return alt ? [lon, lat, alt] : [lon, lat]
}

/* Add Altitude to points only for now
 */
exports.altitude = function(f, alt) {
    if (exports.isFeature(f) && exports.hasGeom(f)) {
        f.geometry = exports.altitude(f.geometry)
    } else if (exports.isGeom(f)) {
        if (f.type == "Point") {
            if (f.coordinates.length == 2) // no altitude, add it
                f.coordinates.push(alt)
            else(f.coordinates.length == 3) // altitude already present, replace it
            f.coordinates[2] = alt
        }
    }
    return f
}

// only for points
exports.hasAltitude = function(f) {
    return exports.coords(f) > 3
}

/* Convert a FeatureCollection of LineString into a single MultiLineString geometry
 * as required for some turf functions.
 * Returns MultiLineString
 */
exports.multilinestring = function(fc) {
    var mls = []
    fc.features.forEach(function(f, idx) {
        if (f.geometry.type == "LineString")
            mls.push(f.geometry.coordinates)
    })
    return exports.MultiLineString(mls)
}

/*  Find feature such as fc.features[].properties.what == name
 *  Returns Feature or false if not found
 */
exports.findFeature = function(query, fc, property) {
    var f = false
    var idx = 0
    while (!f && idx < fc.features.length) {
        if (fc.features[idx].hasOwnProperty("properties") && fc.features[idx].properties.hasOwnProperty(property) && fc.features[idx].properties[property] == query)
            f = fc.features[idx]
        idx++
    }
    return f
}

// returns whether it is a feature
exports.isFeature = function(f) {
    return f.hasOwnProperty("type") && (f.type == "Feature")
}

// returns wether feature has properties
exports.hasProperties = function(f) {
    return exports.isFeature(f) && f.hasOwnProperty("properties")
}

// returns wether feature has properties
exports.hasGeometry = function(f) {
    return exports.isFeature(f) && f.hasOwnProperty("geometry")
}

// returns whether it is a geometry
exports.isGeom = function(f) {
    return (f.hasOwnProperty("type") && (["Point", "LienString", "Polygon", "MultiPoint", "MultiLienString", "MultiPolygon"].indexOf(f.type) >= 0) && Array.isArray(f.coordinates))
}

exports.hasGeom = function(f) {
    return exports.isFeature(f) && (exports.isGeom(f.geometry) || exports.isGeom(f))
}

// returns feature's property or null
exports.featureProp = function(f, prop) {
    return exports.hasProperties(f) && f.properties.hasOwnProperty(prop) ? f.properties[prop] : null
}

// returns feature's identifier or null
exports.featureId = function(f) { // can either be f.id or f.properties.id
    return f.hasOwnProperty("id") ? f["id"] : exports.featureProp(f, "id")
}

// convert a linestring (array of coordinates) as a FeatureCollection of Point
exports.toPointFeatureCollection = function(points) {
    var fc = []
    points.forEach(function(p, i) {
        fc.push(exports.Feature(exports.Point(p), { "idx": i }))
    })
    return exports.FeatureCollection(fc)
}

// convert a FeatureCollection of Point as a linestring (array of coordinates)
exports.toPoints = function(fc) {
    var points = []
    fc.features.forEach(function(f, i) {
        if (f.geometry.type == "Point")
            points.push(f.geometry.coordinates)
    })
    return points // should return a linestring geom?
}

exports.addProp = function(f, prop, value) {
    if (!exports.isFeature(f))
        return
    f.properties |= {}
    f.properties[prop] = value
    return f
}

exports.copyProps = function(f_from, f_to, props = null) {
    if (!exports.hasProperties(f_from))
        return
    f_to.properties |= {}
    if (props) {
        for (var prop in f_from.properties) {
            if (f_from.properties.hasOwnProperty(prop) && (props.indexOf(prop) > -1)) {
                f_to.properties[prop] = f_from.properties[prop]
            }
        }
    } else { // copy all props
        for (var prop in f_from.properties) {
            if (f_from.properties.hasOwnProperty(prop)) {
                f_to.properties[prop] = f_from.properties[prop]
            }
        }
    }
}

/* Find route from p_from to p_to on network of roads.
 * Returns LineString or roads or direct path between the two points if no road found.
 */
exports.route = function(p_from, p_to, network, p = 0.0005) {
    const pathfinder = new PathFinder(network, {
        precision: p
    });
    const path = pathfinder.findPath(p_from, p_to);
    return exports.LineString(path ? path.path : [p_from, p_to])
}



/* Find closest point to network of roads (FeatureCollection of LineStrings)
 * Returns Point
 */
exports.findClosest = function(p, network) {
    if (exports.isFeature(p)) { // cache result
        p.properties = p.properties ? p.properties : {}
        if (!p.properties.hasOwnProperty(CACHE_NAME) || !p.properties[CACHE_NAME].hasOwnProperty(network._network_name)) {
            p.properties.nearestPointOnLine = p.properties.hasOwnProperty(CACHE_NAME) ? p.properties[CACHE_NAME] : {}
            if (!network.hasOwnProperty(MLS_CACHE)) { // build suitable structure for nearestPointOnLine, cache it.
                network[MLS_CACHE] = exports.multilinestring(network)
            }
            p.properties[CACHE_NAME][network._network_name] = turf.nearestPointOnLine(network[MLS_CACHE], p)
        }
        return p.properties[CACHE_NAME][network._network_name]
    } else {
        if (!network.hasOwnProperty(MLS_CACHE)) { // build suitable structure for nearestPointOnLine, cache it.
            network[MLS_CACHE] = exports.multilinestring(network)
        }
        return turf.nearestPointOnLine(network[MLS_CACHE], p)
    }
}


/* complexify all LineStrings of a feature collection
 * (should be extended to MultiLineString as well)
 */
exports.complexify = function(fc) {
    fc.features.forEach(function(f) {
        if (f.geometry.type == "LineString")
            f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
    })
}

/*  Utility functions to add/set/reset color of a Point or LineString feature for geojson.io
 */
exports.colorPoint = function(p, color, letter, size = "medium") {
    p.properties = p.hasOwnProperty("properties") ? p.properties : {}
    p.properties["marker-color"] = color
    p.properties["marker-size"] = size
    p.properties["marker-symbol"] = letter
}

exports.colorLineString = function(line, color, width = 2) {
    line.properties = line.hasOwnProperty("properties") ? line.properties : {}
    line.properties["stroke"] = color
    line.properties["stroke-width"] = width
    line.properties["stroke-opacity"] = 1
}

/*  Displays latitute and longitude nicely
 */
exports.ll = function(p, n = 4) {
    return "(" + exports.rn(p[1], n) + ',' + exports.rn(p[0], n) + ((p.length > 2) ? (',' + exports.rn(p[0], n) + ")") : ")")
}

/*  Rounds number to precision for display
 */
exports.rn = function(p, n = 4) {
    r = Math.pow(10, n)
    return Math.round(p * r) / r
}

/*  Clone a GeoJSON object
 */
exports.cleanCopy = function(j) {
    return JSON.parse(JSON.stringify(j))
}

exports.mergeProperties = function(dst, src, OVERWRITE = false) {
    for (var p in src) {
        if (src.hasOwnProperty(p)) {
            if (!dst.hasOwnProperty(p) ||
                (dst.hasOwnProperty(p) && OVERWRITE)) { // we don't overwrite existing props
                dst[p] = src[p]
            }
        }
    }
    return dst
}