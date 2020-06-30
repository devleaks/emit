import PathFinder from 'geojson-path-finder';
import geojsonTool from 'geojson-tools';
import turf from '@turf/turf';

const CACHE_NAME = "nearestPointOnLine"
const MLS_CACHE = "mls"

/* GeoJSON Utility and normalisation exports.*/
export const Geometry = function(coords, type) {
    return {
        "type": type,
        "coordinates": coords
    }
};

/* avoid GeometryCollection */

export const Point = function(coords) {
    return Geometry(coords, "Point");
};

export const MultiPoint = function(coords) {
    return Geometry(coords, "MultiPoint");
};

export const LineString = function(coords) {
    return Geometry(coords, "LineString");
};

export const MultiLineString = function(coords) {
    return Geometry(coords, "MultiLineString");
};

export const Polygon = function(coords) {
    return Geometry(coords, "Polygon");
};

export const MultiPolygon = function(coords) {
    return Geometry(coords, "MultiPolygon");
};

export const Feature = function(geom, props = false) {
    return {
        "type": "Feature",
        "geometry": geom,
        "properties": props ? props : {}
    }
};

export const FeatureCollection = function(f, props = false) {
    return props ? {
        "type": "FeatureCollection",
        "features": f,
        "properties": props
    } : {
        "type": "FeatureCollection",
        "features": f
    }
};

/* not correct, a Feature can be without coordinate...
 */
export const coords = function(f) {
    return (f.type == "Feature") ? f.geometry.coordinates : (f.coordinates ? f.coordinates : f)
};

// LatLon is lat,lon
export const LatLon = function(lat, lon, alt = false) {
    return alt ? [lon, lat, alt] : [lon, lat]
};

// Position is GeoJSON standard lon,lat
export const Position = function(lon, lat, alt = false) {
    return alt ? [lon, lat, alt] : [lon, lat]
};

/* Add Altitude to points only for now
 */
export const altitude = function(f, alt) {
    if (isFeature(f) && hasGeom(f)) {
        f.geometry = altitude(f.geometry)
    } else if (isGeom(f)) {
        if (f.type == "Point") {
            if (f.coordinates.length == 2) // no altitude, add it
                f.coordinates.push(alt)
            else(f.coordinates.length == 3) // altitude already present, replace it
            f.coordinates[2] = alt
        }
    }
    return f
};

// only for points
export const hasAltitude = function(f) {
    return coords(f) > 3;
};

/* Convert a FeatureCollection of LineString into a single MultiLineString geometry
 * as required for some turf functions.
 * Returns MultiLineString
 */
export const multilinestring = function(fc) {
    var mls = []
    fc.features.forEach(function(f, idx) {
        if (f.geometry.type == "LineString")
            mls.push(f.geometry.coordinates)
    })
    return MultiLineString(mls);
};

/*  Find feature such as fc.features[].properties.what == name
 *  Returns Feature or false if not found
 */
export const findFeature = function(query, fc, property) {
    var f = false
    var idx = 0
    while (!f && idx < fc.features.length) {
        if (fc.features[idx].hasOwnProperty("properties") && fc.features[idx].properties.hasOwnProperty(property) && fc.features[idx].properties[property] == query)
            f = fc.features[idx]
        idx++
    }
    return f
};

// returns whether it is a feature
export const isFeature = function(f) {
    return f.hasOwnProperty("type") && (f.type == "Feature")
};

// returns wether feature has properties
export const hasProperties = function(f) {
    return isFeature(f) && f.hasOwnProperty("properties");
};

// returns wether feature has properties
export const hasGeometry = function(f) {
    return isFeature(f) && f.hasOwnProperty("geometry");
};

// returns whether it is a geometry
export const isGeom = function(f) {
    return (f.hasOwnProperty("type") && (["Point", "LienString", "Polygon", "MultiPoint", "MultiLienString", "MultiPolygon"].indexOf(f.type) >= 0) && Array.isArray(f.coordinates))
};

export const hasGeom = function(f) {
    return isFeature(f) && (isGeom(f.geometry) || isGeom(f));
};

// returns feature's property or null
export const featureProp = function(f, prop) {
    return hasProperties(f) && f.properties.hasOwnProperty(prop) ? f.properties[prop] : null;
};

// returns feature's identifier or null
export const featureId = function(f) { // can either be f.id or f.properties.id
    return f.hasOwnProperty("id") ? f["id"] : featureProp(f, "id");
};

// convert a linestring (array of coordinates) as a FeatureCollection of Point
export const toPointFeatureCollection = function(points) {
    var fc = []
    points.forEach(function(p, i) {
        fc.push(Feature(Point(p), { "idx": i }))
    })
    return FeatureCollection(fc);
};

// convert a FeatureCollection of Point as a linestring (array of coordinates)
export const toPoints = function(fc) {
    var points = []
    fc.features.forEach(function(f, i) {
        if (f.geometry.type == "Point")
            points.push(f.geometry.coordinates)
    })
    return points // should return a linestring geom?
};

export const addProp = function(f, prop, value) {
    if (!isFeature(f))
        return
    f.properties |= {}
    f.properties[prop] = value
    return f
};

export const copyProps = function(f_from, f_to, props = null) {
    if (!hasProperties(f_from))
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
};

/* Find route from p_from to p_to on network of roads.
 * Returns LineString or roads or direct path between the two points if no road found.
 */
export const route = function(p_from, p_to, network, p = 0.0005) {
    const pathfinder = new PathFinder(network, {
        precision: p
    });
    const path = pathfinder.findPath(p_from, p_to);
    return LineString(path ? path.path : [p_from, p_to]);
};

/* Find closest point to network of roads (FeatureCollection of LineStrings)
 * Returns Point
 */
export const findClosest = function(p, network) {
    if (isFeature(p)) { // cache result
        p.properties = p.properties ? p.properties : {}
        if (!p.properties.hasOwnProperty(CACHE_NAME) || !p.properties[CACHE_NAME].hasOwnProperty(network._network_name)) {
            p.properties.nearestPointOnLine = p.properties.hasOwnProperty(CACHE_NAME) ? p.properties[CACHE_NAME] : {}
            if (!network.hasOwnProperty(MLS_CACHE)) { // build suitable structure for nearestPointOnLine, cache it.
                network[MLS_CACHE] = multilinestring(network)
            }
            p.properties[CACHE_NAME][network._network_name] = turf.nearestPointOnLine(network[MLS_CACHE], p)
        }
        return p.properties[CACHE_NAME][network._network_name]
    } else {
        if (!network.hasOwnProperty(MLS_CACHE)) { // build suitable structure for nearestPointOnLine, cache it.
            network[MLS_CACHE] = multilinestring(network)
        }
        return turf.nearestPointOnLine(network[MLS_CACHE], p)
    }
};

/* complexify all LineStrings of a feature collection
 * (should be extended to MultiLineString as well)
 */
export const complexify = function(fc) {
    fc.features.forEach(function(f) {
        if (f.geometry.type == "LineString")
            f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
    })
};

/*  Utility functions to add/set/reset color of a Point or LineString feature for geojson.io
 */
export const colorPoint = function(p, color, letter, size = "medium") {
    p.properties = p.hasOwnProperty("properties") ? p.properties : {}
    p.properties["marker-color"] = color
    p.properties["marker-size"] = size
    p.properties["marker-symbol"] = letter
};

export const colorLineString = function(line, color, width = 2) {
    line.properties = line.hasOwnProperty("properties") ? line.properties : {}
    line.properties["stroke"] = color
    line.properties["stroke-width"] = width
    line.properties["stroke-opacity"] = 1
};

/*  Displays latitute and longitude nicely
 */
export const ll = function(p, n = 4) {
    return "(" + rn(p[1], n) + ',' + rn(p[0], n) + ((p.length > 2) ? (',' + rn(p[0], n) + ")") : ")");
};

/*  Rounds number to precision for display
 */
export const rn = function(p, n = 4) {
    let r = Math.pow(10, n)
    return Math.round(p * r) / r
};

/*  Clone a GeoJSON object
 */
export const cleanCopy = function(f) {
    return JSON.parse(JSON.stringify(f))
};

// Remove temporary objects stored for this simulator
export const removeTemporaryProperties = function(f, remove = ["marker", "nearestPointOnLine", "idx"]) {
    remove.forEach(function(prop, idx) {
        if (f.properties.hasOwnProperty(prop))
            delete f.properties[prop]
    })
    return f
};

// Merge Feature properties.
export const mergeProperties = function(dst, src, OVERWRITE = false) {
    for (var p in src) {
        if (src.hasOwnProperty(p)) {
            if (!dst.hasOwnProperty(p) ||
                (dst.hasOwnProperty(p) && OVERWRITE)) { // we don't overwrite existing props
                dst[p] = src[p]
            }
        }
    }
    return dst
};

// Returns random element from array
export const randomElemFrom = function(a) {
    return a[Math.floor(Math.random() * a.length)]
};

// Returns whether 2 points are close to some precision
export const close = function(p1, p2, precision) {
    return ( (Math.abs(p1[0]-p2[0]) < precision) && (Math.abs(p1[1]-p2[1]) < precision) )
};

// Returns whether 2 points are close to some distance (in meter)
export const close_distance = function(p1, p2, d) {
    return turf.distance(p1, p2, "kilometers") < (d/1000)
};

//
export const randomValue = function(base, plusminus = false) {
    var ret = 0
    if(Array.isArray(base)) {
        ret = base[0] + Math.round(Math.random() * Math.abs(base[1]-base[0]))
    } else {
        ret = Math.round(Math.random() * base)
    }
    if(plusminus)
        ret *= Math.random() > 0.5 ? 1 : -1
    return ret
};

