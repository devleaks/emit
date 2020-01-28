const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')
const turf = require('@turf/turf')

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
    return {
        "type": "FeatureCollection",
        "features": f,
        "properties": props ? props : {}
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
        if (fc.features[idx].properties && fc.features[idx].properties[property] && fc.features[idx].properties[property] == query)
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
    return isFeature(f) && (isGeom(f.geometry) || isGeom(f))
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
    if(! exports.isFeature(f))
        return
    f.properties |= {}
    f.properties[prop] = value
    return f
}

exports.copyProps = function(f_from, f_to, props = null) {
    if(! exports.hasProperties(f_from))
        return
    f_to.properties |= {}
    if(props) {
        for (var prop in f_from.properties) {
            if ( f_from.properties.hasOwnProperty(prop) && (props.indexOf(prop) > -1) ) {
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



/* Find closest point to network of roads (FeatureCollectionof LineStrings)
 * Returns Point
 */
exports.findClosest = function(p, network) {
    if (typeof(p.nearestPointOnLine) == "undefined" || typeof(p.nearestPointOnLine[network._network_name]) == "undefined") {
        p.nearestPointOnLine = p.nearestPointOnLine ? p.nearestPointOnLine : {}
        if (typeof(network.mls) == "undefined") { // build suitable structure for nearestPointOnLine, cache it.
            network.mls = exports.multilinestring(network)
        }
        p.nearestPointOnLine[network._network_name] = turf.nearestPointOnLine(network.mls, p)
    }
    return p.nearestPointOnLine[network._network_name]
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