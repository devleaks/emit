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

exports.Feature = function(geom, props  = false) {
    return {
        "type": "Feature",
        "geometry": geom,
        "properties": props ? props : {}
    }
}

exports.FeatureCollection = function(f, props  = false) {
    return {
        "type": "FeatureCollection",
        "features": f,
        "properties": props ? props : {}
    }
}

/* not correct, a Feature can be without coordinate...
 */
exports.coords = function(f) {
    return (f.type  == "Feature") ? f.geometry.coordinates : (f.coordinates ? f.coordinates : f)
}

exports.LatLon = function(lat, lon, alt = null) {
    return alt ? [lon, lat, alt] : [lon, lat]
}

exports.Position = function(lon, lat, alt = null) {
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

exports.isFeature = function(f) {
    return ( (typeof(f.type) != "undefined") && (f.type == "Feature") )
}


exports.isGeom = function(f) {
    return ( (typeof(f.type) != "undefined") && (["Point", "LienString","Polygon","MultiPoint", "MultiLienString","MultiPolygon"].indexOf(f.type) >= 0) && Array.isArray(f.coordinates) )
}


exports.hasGeom = function(f) {
    return ( isFeature(f) && isGeom(f.geometry) || isGeom(f) )
}
